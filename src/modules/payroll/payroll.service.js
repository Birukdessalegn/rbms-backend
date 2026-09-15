const pool = require("../../config/database");
const { calculateEmployeePayroll } = require("./payroll.tax");

/**
 * Get monthly payroll summary (either returns existing approved run or generates live preview draft)
 * @param {string} periodMonth - Month in format 'YYYY-MM' (e.g. '2026-09')
 */
const getPayrollSummary = async (periodMonth) => {
  const targetMonth = periodMonth || new Date().toISOString().slice(0, 7);

  // 1. Check if an approved payroll run already exists for this month
  const runRes = await pool.query(
    `
    SELECT * FROM payroll_runs
    WHERE period_month = $1
    LIMIT 1
    `,
    [targetMonth]
  );

  const existingRun = runRes.rows[0];

  if (existingRun && existingRun.status === "approved") {
    // Fetch saved items
    const itemsRes = await pool.query(
      `
      SELECT 
        pi.*,
        e.first_name,
        e.last_name,
        e.employee_code,
        e.phone,
        e.email,
        d.name AS department_name,
        r.name AS role_name
      FROM payroll_items pi
      JOIN employees e ON pi.employee_id = e.id
      LEFT JOIN departments d ON e.department_id = d.id
      LEFT JOIN roles r ON e.role_id = r.id
      WHERE pi.payroll_run_id = $1
      ORDER BY e.first_name ASC, e.last_name ASC
      `,
      [existingRun.id]
    );

    return {
      periodMonth: targetMonth,
      status: "approved",
      approvedAt: existingRun.approved_at,
      notes: existingRun.notes,
      stats: {
        totalEmployees: Number(existingRun.total_employees || 0),
        totalGross: Number(existingRun.total_gross || 0),
        totalDeductions: Number(existingRun.total_deductions || 0),
        totalNet: Number(existingRun.total_net || 0),
      },
      items: itemsRes.rows,
    };
  }

  // 2. Otherwise, generate a live calculated draft for all active staff
  const employeesRes = await pool.query(
    `
    SELECT 
      e.id AS employee_id,
      e.employee_code,
      e.first_name,
      e.last_name,
      e.phone,
      e.email,
      COALESCE(e.salary, 0) AS base_salary,
      d.name AS department_name,
      r.name AS role_name
    FROM employees e
    LEFT JOIN departments d ON e.department_id = d.id
    LEFT JOIN roles r ON e.role_id = r.id
    WHERE e.status = 'active'
    ORDER BY e.first_name ASC, e.last_name ASC
    `
  );

  // Query monthly attendance breakdown for each employee
  const attendanceRes = await pool.query(
    `
    SELECT 
      employee_id,
      COUNT(*) FILTER (WHERE status IN ('present', 'late', 'half_day')) AS days_worked,
      COUNT(*) FILTER (WHERE status = 'absent') AS days_absent
    FROM attendance
    WHERE TO_CHAR(attendance_date, 'YYYY-MM') = $1
    GROUP BY employee_id
    `,
    [targetMonth]
  );

  const attendanceMap = new Map();
  for (const att of attendanceRes.rows) {
    attendanceMap.set(Number(att.employee_id), {
      daysWorked: Number(att.days_worked || 0),
      daysAbsent: Number(att.days_absent || 0),
    });
  }

  let totalGross = 0;
  let totalDeductions = 0;
  let totalNet = 0;

  const items = employeesRes.rows.map((emp) => {
    const att = attendanceMap.get(Number(emp.employee_id));
    const daysWorked = att ? att.daysWorked : 30;
    const daysAbsent = att ? att.daysAbsent : 0;

    const calc = calculateEmployeePayroll({
      baseSalary: Number(emp.base_salary || 0),
      daysWorked,
      daysAbsent,
      allowances: 0,
      overtime: 0,
      bonuses: 0,
      otherDeductions: 0,
    });

    totalGross += calc.grossSalary;
    totalDeductions += calc.totalDeductions;
    totalNet += calc.netSalary;

    return {
      employee_id: emp.employee_id,
      employee_code: emp.employee_code,
      first_name: emp.first_name,
      last_name: emp.last_name,
      phone: emp.phone,
      email: emp.email,
      department_name: emp.department_name || "General",
      role_name: emp.role_name || "Staff",
      base_salary: calc.baseSalary,
      days_worked: calc.daysWorked,
      days_absent: calc.daysAbsent,
      allowances: calc.allowances,
      overtime: calc.overtime,
      bonuses: calc.bonuses,
      gross_salary: calc.grossSalary,
      absence_deduction: calc.absenceDeduction,
      pension_employee: calc.pensionEmployee,
      pension_employer: calc.pensionEmployer,
      taxable_income: calc.taxableIncome,
      income_tax: calc.incomeTax,
      other_deductions: calc.otherDeductions,
      total_deductions: calc.totalDeductions,
      net_salary: calc.netSalary,
    };
  });

  return {
    periodMonth: targetMonth,
    status: existingRun ? existingRun.status : "draft",
    stats: {
      totalEmployees: items.length,
      totalGross: Number(totalGross.toFixed(2)),
      totalDeductions: Number(totalDeductions.toFixed(2)),
      totalNet: Number(totalNet.toFixed(2)),
    },
    items,
  };
};

/**
 * Approve & lock a monthly payroll run
 */
const approvePayrollRun = async ({ periodMonth, items = [], notes = "", userId = null }) => {
  if (!periodMonth) {
    throw new Error("Period month is required (e.g. 'YYYY-MM').");
  }

  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    let totalGross = 0;
    let totalDeductions = 0;
    let totalNet = 0;

    for (const item of items) {
      totalGross += Number(item.gross_salary || item.base_salary || 0);
      totalDeductions += Number(item.total_deductions || item.deductions || 0);
      totalNet += Number(item.net_salary || 0);
    }

    // Upsert payroll run
    const runRes = await client.query(
      `
      INSERT INTO payroll_runs (
        period_month,
        status,
        total_employees,
        total_gross,
        total_deductions,
        total_net,
        processed_by,
        approved_at,
        notes
      )
      VALUES ($1, 'approved', $2, $3, $4, $5, $6, NOW(), $7)
      ON CONFLICT (period_month) DO UPDATE SET
        status = 'approved',
        total_employees = EXCLUDED.total_employees,
        total_gross = EXCLUDED.total_gross,
        total_deductions = EXCLUDED.total_deductions,
        total_net = EXCLUDED.total_net,
        processed_by = EXCLUDED.processed_by,
        approved_at = NOW(),
        notes = EXCLUDED.notes,
        updated_at = NOW()
      RETURNING *
      `,
      [
        periodMonth,
        items.length,
        totalGross,
        totalDeductions,
        totalNet,
        userId,
        notes || `Monthly payroll for ${periodMonth}`,
      ]
    );

    const runId = runRes.rows[0].id;

    // Delete existing items for this run before re-inserting
    await client.query(
      `DELETE FROM payroll_items WHERE payroll_run_id = $1`,
      [runId]
    );

    for (const item of items) {
      await client.query(
        `
        INSERT INTO payroll_items (
          payroll_run_id,
          employee_id,
          base_salary,
          days_worked,
          days_absent,
          allowances,
          overtime,
          bonuses,
          gross_salary,
          absence_deduction,
          pension_employee,
          pension_employer,
          income_tax,
          other_deductions,
          total_deductions,
          net_salary,
          notes
        )
        VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17
        )
        `,
        [
          runId,
          item.employee_id,
          Number(item.base_salary || 0),
          Number(item.days_worked || 0),
          Number(item.days_absent || 0),
          Number(item.allowances || 0),
          Number(item.overtime || 0),
          Number(item.bonuses || 0),
          Number(item.gross_salary || item.base_salary || 0),
          Number(item.absence_deduction || 0),
          Number(item.pension_employee || 0),
          Number(item.pension_employer || 0),
          Number(item.income_tax || 0),
          Number(item.other_deductions || 0),
          Number(item.total_deductions || 0),
          Number(item.net_salary || 0),
          item.notes || null,
        ]
      );
    }

    await client.query("COMMIT");

    return getPayrollSummary(periodMonth);
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
};

/**
 * Get history of all payroll runs
 */
const getPayrollRuns = async () => {
  const res = await pool.query(
    `
    SELECT 
      pr.*,
      u.name AS processed_by_name
    FROM payroll_runs pr
    LEFT JOIN users u ON pr.processed_by = u.id
    ORDER BY pr.period_month DESC
    `
  );
  return res.rows;
};

module.exports = {
  getPayrollSummary,
  approvePayrollRun,
  getPayrollRuns,
};
