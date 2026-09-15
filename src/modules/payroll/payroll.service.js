const pool = require("../../config/database");

/**
 * Ethiopian Statutory Employment Income Tax Calculator
 * Proclamation No. 979/2016
 *
 * Taxable income = Gross Salary - Absence Deductions - Pension Employee (Pension is tax-exempt)
 * Brackets:
 *  0 - 600 ETB: 0% (deduction: 0)
 *  601 - 1,650 ETB: 10% (deduction: 60)
 *  1,651 - 3,200 ETB: 15% (deduction: 142.50)
 *  3,201 - 5,250 ETB: 20% (deduction: 302.50)
 *  5,251 - 7,800 ETB: 25% (deduction: 565)
 *  7,801 - 10,900 ETB: 30% (deduction: 955)
 *  Over 10,900 ETB: 35% (deduction: 1,500)
 */
const calculateEthiopianIncomeTax = (taxableIncome) => {
  const income = Math.max(0, Number(taxableIncome || 0));
  let tax = 0;

  if (income <= 600) {
    tax = 0;
  } else if (income <= 1650) {
    tax = income * 0.10 - 60;
  } else if (income <= 3200) {
    tax = income * 0.15 - 142.50;
  } else if (income <= 5250) {
    tax = income * 0.20 - 302.50;
  } else if (income <= 7800) {
    tax = income * 0.25 - 565.00;
  } else if (income <= 10900) {
    tax = income * 0.30 - 955.00;
  } else {
    tax = income * 0.35 - 1500.00;
  }

  return Number(Math.max(0, tax).toFixed(2));
};

/**
 * Get monthly payroll calculation sheet
 */
const getPayrollSummary = async (periodMonth) => {
  const currentMonth = periodMonth || new Date().toISOString().slice(0, 7);

  // 1. Check if an approved/saved payroll run already exists for this month
  const savedRunQuery = `
    SELECT pr.*, u.username AS processed_by_username
    FROM payroll_runs pr
    LEFT JOIN users u ON pr.processed_by = u.id
    WHERE pr.period_month = $1
  `;
  const { rows: savedRuns } = await pool.query(savedRunQuery, [currentMonth]);
  const savedRun = savedRuns[0] || null;

  let items = [];

  if (savedRun) {
    // Return saved line items
    const itemsQuery = `
      SELECT 
        pi.*,
        e.employee_code,
        e.first_name,
        e.last_name,
        d.name AS department_name,
        r.name AS position_title
      FROM payroll_items pi
      JOIN employees e ON pi.employee_id = e.id
      LEFT JOIN departments d ON e.department_id = d.id
      LEFT JOIN roles r ON e.role_id = r.id
      WHERE pi.payroll_run_id = $1
      ORDER BY e.first_name ASC
    `;
    const { rows } = await pool.query(itemsQuery, [savedRun.id]);
    items = rows.map((it) => ({
      ...it,
      base_salary: Number(it.base_salary || 0),
      allowances: Number(it.allowances || 0),
      overtime: Number(it.overtime || 0),
      bonuses: Number(it.bonuses || 0),
      gross_salary: Number(it.gross_salary || it.base_salary || 0),
      days_worked: Number(it.days_worked || 0),
      days_absent: Number(it.days_absent || 0),
      absence_deduction: Number(it.absence_deduction || 0),
      pension_employee: Number(it.pension_employee || 0),
      pension_employer: Number(it.pension_employer || 0),
      income_tax: Number(it.income_tax || 0),
      other_deductions: Number(it.other_deductions || 0),
      total_deductions: Number(it.total_deductions || it.deductions || 0),
      deductions: Number(it.total_deductions || it.deductions || 0),
      net_salary: Number(it.net_salary || 0)
    }));
  } else {
    // Compute dynamic live preview from employee salaries and attendance
    const employeesQuery = `
      SELECT 
        e.id AS employee_id,
        e.employee_code,
        e.first_name,
        e.last_name,
        COALESCE(e.salary, 0) AS base_salary,
        d.name AS department_name,
        r.name AS position_title,
        COALESCE(att.days_present, 0) AS days_worked,
        COALESCE(att.days_absent, 0) AS days_absent
      FROM employees e
      LEFT JOIN departments d ON e.department_id = d.id
      LEFT JOIN roles r ON e.role_id = r.id
      LEFT JOIN (
        SELECT 
          employee_id,
          COUNT(CASE WHEN status::text IN ('present', 'late') THEN 1 END) AS days_present,
          COUNT(CASE WHEN status::text = 'absent' THEN 1 END) AS days_absent
        FROM attendance
        WHERE TO_CHAR(attendance_date, 'YYYY-MM') = $1
        GROUP BY employee_id
      ) att ON e.id = att.employee_id
      WHERE e.status = 'active'
      ORDER BY e.first_name ASC
    `;
    const { rows } = await pool.query(employeesQuery, [currentMonth]);

    items = rows.map((emp) => {
      const baseSalary = Number(emp.base_salary || 0);
      const allowances = 0.00;
      const overtime = 0.00;
      const bonuses = 0.00;

      // 1. Gross Salary = Base + Allowances + Overtime + Bonuses
      const grossSalary = Number((baseSalary + allowances + overtime + bonuses).toFixed(2));

      // 2. Absence Deductions = (Days Absent * (Base Salary / 30))
      const daysAbsent = Number(emp.days_absent || 0);
      const dailyRate = baseSalary > 0 ? baseSalary / 30 : 0;
      const absenceDeduction = Number((daysAbsent * dailyRate).toFixed(2));

      // Net earned base after unexcused absences
      const earnedBase = Math.max(0, baseSalary - absenceDeduction);

      // 3. Ethiopian Statutory Pension
      // Employee Pension: 7% of basic earned salary
      const pensionEmployee = Number((earnedBase * 0.07).toFixed(2));
      // Employer Pension: 11% of basic earned salary (company liability, not deducted from net)
      const pensionEmployer = Number((earnedBase * 0.11).toFixed(2));

      // 4. Taxable Income = Gross Salary - Absence Deduction - Pension Employee (statutory exemption)
      const taxableIncome = Math.max(0, grossSalary - absenceDeduction - pensionEmployee);

      // 5. Ethiopian Personal Income Tax (Proclamation 979/2016)
      const incomeTax = calculateEthiopianIncomeTax(taxableIncome);

      // 6. Other deductions
      const otherDeductions = 0.00;

      // 7. Total Deductions = Absence Deduction + Employee Pension + Income Tax + Other Deductions
      const totalDeductions = Number((absenceDeduction + pensionEmployee + incomeTax + otherDeductions).toFixed(2));

      // 8. Net Salary = Gross Salary - Total Deductions
      const netSalary = Math.max(0, Number((grossSalary - totalDeductions).toFixed(2)));

      return {
        employee_id: emp.employee_id,
        employee_code: emp.employee_code,
        first_name: emp.first_name,
        last_name: emp.last_name,
        department_name: emp.department_name,
        position_title: emp.position_title,
        base_salary: baseSalary,
        allowances,
        overtime,
        bonuses,
        gross_salary: grossSalary,
        days_worked: Number(emp.days_worked || 0),
        days_absent: daysAbsent,
        absence_deduction: absenceDeduction,
        pension_employee: pensionEmployee,
        pension_employer: pensionEmployer,
        income_tax: incomeTax,
        other_deductions: otherDeductions,
        total_deductions: totalDeductions,
        deductions: totalDeductions, // backward-compat alias
        net_salary: netSalary,
        payment_status: "pending",
        payment_method: "bank_transfer"
      };
    });
  }

  const totalEmployees = items.length;
  const totalGross = items.reduce((sum, it) => sum + Number(it.gross_salary || it.base_salary || 0), 0);
  const totalDeductions = items.reduce((sum, it) => sum + Number(it.total_deductions || it.deductions || 0), 0);
  const totalNet = items.reduce((sum, it) => sum + Number(it.net_salary || 0), 0);
  const totalTax = items.reduce((sum, it) => sum + Number(it.income_tax || 0), 0);
  const totalPensionEmployee = items.reduce((sum, it) => sum + Number(it.pension_employee || 0), 0);
  const totalPensionEmployer = items.reduce((sum, it) => sum + Number(it.pension_employer || 0), 0);
  const totalAbsence = items.reduce((sum, it) => sum + Number(it.absence_deduction || 0), 0);

  return {
    periodMonth: currentMonth,
    isSaved: !!savedRun,
    status: savedRun ? savedRun.status : "preview",
    savedRun,
    stats: {
      totalEmployees,
      totalGross: Number(totalGross.toFixed(2)),
      totalDeductions: Number(totalDeductions.toFixed(2)),
      totalNet: Number(totalNet.toFixed(2)),
      totalTax: Number(totalTax.toFixed(2)),
      totalPensionEmployee: Number(totalPensionEmployee.toFixed(2)),
      totalPensionEmployer: Number(totalPensionEmployer.toFixed(2)),
      totalAbsence: Number(totalAbsence.toFixed(2))
    },
    items
  };
};

/**
 * Save / Approve monthly payroll run
 */
const savePayrollRun = async ({ periodMonth, items, notes = "", processedBy = null, status = "approved" }) => {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // Immutability check: if existing run is already 'paid', block modification
    const existing = await client.query("SELECT id, status FROM payroll_runs WHERE period_month = $1", [periodMonth]);
    if (existing.rows.length > 0 && existing.rows[0].status === "paid") {
      throw new Error(`Payroll run for ${periodMonth} is already paid and cannot be modified.`);
    }

    const totalEmployees = items.length;
    const totalGross = items.reduce((sum, it) => sum + Number(it.gross_salary || it.base_salary || 0), 0);
    const totalDeductions = items.reduce((sum, it) => sum + Number(it.total_deductions || it.deductions || 0), 0);
    const totalNet = items.reduce((sum, it) => sum + Number(it.net_salary || 0), 0);

    const runQuery = `
      INSERT INTO payroll_runs (period_month, total_employees, total_gross, total_deductions, total_net, status, processed_by, notes)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      ON CONFLICT (period_month) DO UPDATE SET
        total_employees = EXCLUDED.total_employees,
        total_gross = EXCLUDED.total_gross,
        total_deductions = EXCLUDED.total_deductions,
        total_net = EXCLUDED.total_net,
        status = EXCLUDED.status,
        processed_by = EXCLUDED.processed_by,
        notes = EXCLUDED.notes,
        updated_at = CURRENT_TIMESTAMP
      RETURNING *
    `;
    const { rows: [run] } = await client.query(runQuery, [
      periodMonth,
      totalEmployees,
      totalGross,
      totalDeductions,
      totalNet,
      status,
      processedBy,
      notes
    ]);

    // Insert detailed item records
    await client.query(`DELETE FROM payroll_items WHERE payroll_run_id = $1`, [run.id]);
    for (const item of items) {
      const gross = Number(item.gross_salary || item.base_salary || 0);
      const totalDed = Number(item.total_deductions || item.deductions || 0);

      await client.query(`
        INSERT INTO payroll_items (
          payroll_run_id, employee_id, base_salary, allowances, overtime, bonuses, gross_salary,
          days_worked, days_absent, absence_deduction, pension_employee, pension_employer,
          income_tax, other_deductions, total_deductions, deductions, net_salary, payment_status, payment_method, notes
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20)
      `, [
        run.id,
        item.employee_id,
        Number(item.base_salary || 0),
        Number(item.allowances || 0),
        Number(item.overtime || 0),
        Number(item.bonuses || 0),
        gross,
        Number(item.days_worked || 0),
        Number(item.days_absent || 0),
        Number(item.absence_deduction || 0),
        Number(item.pension_employee || 0),
        Number(item.pension_employer || 0),
        Number(item.income_tax || 0),
        Number(item.other_deductions || 0),
        totalDed,
        totalDed,
        Number(item.net_salary || 0),
        item.payment_status || "pending",
        item.payment_method || "bank_transfer",
        item.notes || null
      ]);
    }

    await client.query("COMMIT");
    return await getPayrollSummary(periodMonth);
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
};

/**
 * Get all historical payroll runs
 */
const getPayrollHistory = async () => {
  const query = `
    SELECT pr.*, u.username AS processed_by_username
    FROM payroll_runs pr
    LEFT JOIN users u ON pr.processed_by = u.id
    ORDER BY pr.period_month DESC
  `;
  const { rows } = await pool.query(query);
  return rows;
};

module.exports = {
  getPayrollSummary,
  savePayrollRun,
  getPayrollHistory
};
