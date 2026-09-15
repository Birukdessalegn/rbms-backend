const pool = require("../../config/database");

// Get attendance records with filtering & pagination
const getAllAttendance = async (filters = {}) => {
  const { startDate, endDate, employeeId, page = 1, limit = 50 } = filters;

  let query = `
    SELECT
      a.id,
      a.employee_id,
      e.employee_code,
      e.first_name,
      e.last_name,
      e.phone,
      d.name AS department,
      r.name AS role,
      a.attendance_date,
      a.check_in,
      a.check_out,
      a.status,
      a.notes,
      a.recorded_by,
      ROUND((EXTRACT(EPOCH FROM (a.check_out - a.check_in))/3600.0)::numeric, 2) AS total_hours,
      a.created_at,
      a.updated_at
    FROM attendance a
    JOIN employees e ON a.employee_id = e.id
    LEFT JOIN departments d ON e.department_id = d.id
    LEFT JOIN roles r ON e.role_id = r.id
    WHERE 1=1
  `;
  const queryParams = [];

  if (startDate) {
    queryParams.push(startDate);
    query += ` AND a.attendance_date >= $${queryParams.length}`;
  }
  if (endDate) {
    queryParams.push(endDate);
    query += ` AND a.attendance_date <= $${queryParams.length}`;
  }
  if (employeeId) {
    queryParams.push(employeeId);
    query += ` AND a.employee_id = $${queryParams.length}`;
  }

  query += ` ORDER BY a.attendance_date DESC, a.check_in DESC`;

  if (limit) {
    const pageNum = parseInt(page, 10) || 1;
    const limitNum = parseInt(limit, 10) || 50;
    const offset = (pageNum - 1) * limitNum;

    queryParams.push(limitNum);
    query += ` LIMIT $${queryParams.length}`;
    queryParams.push(offset);
    query += ` OFFSET $${queryParams.length}`;
  }

  const result = await pool.query(query, queryParams);
  return result.rows;
};

// Get attendance by employee
const getEmployeeAttendance = async (employeeId) => {
  const result = await pool.query(
    `
    SELECT
      a.id,
      a.employee_id,
      e.employee_code,
      e.first_name,
      e.last_name,
      a.attendance_date,
      a.check_in,
      a.check_out,
      a.status,
      a.notes,
      ROUND((EXTRACT(EPOCH FROM (a.check_out - a.check_in))/3600.0)::numeric, 2) AS total_hours
    FROM attendance a
    JOIN employees e ON a.employee_id = e.id
    WHERE a.employee_id = $1
    ORDER BY a.attendance_date DESC
    `,
    [employeeId]
  );

  return result.rows;
};

// Get current shift attendance (today or overnight shift starting yesterday)
const getTodayAttendance = async () => {
  const result = await pool.query(`
    SELECT
      a.id,
      a.employee_id,
      e.employee_code,
      e.first_name,
      e.last_name,
      d.name AS department,
      r.name AS role,
      a.attendance_date,
      a.check_in,
      a.check_out,
      a.status,
      a.notes,
      CASE
        WHEN a.check_out IS NOT NULL AND a.check_in IS NOT NULL THEN
          ROUND((EXTRACT(EPOCH FROM (a.check_out - a.check_in))/3600.0)::numeric, 2)
        ELSE 0
      END AS total_hours
    FROM attendance a
    JOIN employees e ON a.employee_id = e.id
    LEFT JOIN departments d ON e.department_id = d.id
    LEFT JOIN roles r ON e.role_id = r.id
    WHERE a.attendance_date = (
      CASE
        WHEN EXTRACT(HOUR FROM CURRENT_TIME) < 7 THEN (CURRENT_DATE - INTERVAL '1 day')::date
        ELSE CURRENT_DATE
      END
    )
    ORDER BY a.check_in ASC
  `);

  return result.rows;
};

// Check in employee with club night shift & grace period rules:
// - Shift start: 6:00 PM (18:00)
// - Early check-in starts: 5:50 PM (17:50)
// - Grace period until: 6:20 PM (18:20) -> 'present'
// - After 6:20 PM (18:20) up to 7:00 AM -> 'late'
// - Shift date between 00:00 and 07:00 AM -> assigned to yesterday's date
const checkIn = async (employeeId, notes = null) => {
  const result = await pool.query(
    `
    WITH calc AS (
      SELECT
        CASE
          WHEN EXTRACT(HOUR FROM CURRENT_TIME) < 7 THEN CURRENT_DATE - 1
          ELSE CURRENT_DATE
        END AS calc_date,
        CASE
          WHEN (EXTRACT(HOUR FROM CURRENT_TIME) * 60 + EXTRACT(MINUTE FROM CURRENT_TIME)) <= (18 * 60 + 20)
               AND (EXTRACT(HOUR FROM CURRENT_TIME) * 60 + EXTRACT(MINUTE FROM CURRENT_TIME)) >= (17 * 60 + 50) THEN 'present'
          WHEN (EXTRACT(HOUR FROM CURRENT_TIME) * 60 + EXTRACT(MINUTE FROM CURRENT_TIME)) < (17 * 60 + 50)
               AND EXTRACT(HOUR FROM CURRENT_TIME) >= 7 THEN 'present'
          ELSE 'late'
        END AS calc_status
    )
    INSERT INTO attendance (
      employee_id,
      attendance_date,
      check_in,
      status,
      notes
    )
    SELECT
      $1,
      calc_date,
      CURRENT_TIMESTAMP,
      calc_status::attendance_status,
      $2
    FROM calc
    ON CONFLICT (employee_id, attendance_date)
    DO UPDATE SET
      check_in = COALESCE(attendance.check_in, CURRENT_TIMESTAMP),
      check_out = NULL,
      status = EXCLUDED.status,
      notes = COALESCE(EXCLUDED.notes, attendance.notes),
      updated_at = CURRENT_TIMESTAMP
    RETURNING *
    `,
    [employeeId, notes]
  );

  return result.rows[0];
};

// Check out employee from their latest active check-in (open session)
const checkOut = async (employeeId) => {
  const result = await pool.query(
    `
    UPDATE attendance
    SET
      check_out = CURRENT_TIMESTAMP,
      updated_at = CURRENT_TIMESTAMP
    WHERE id = (
      SELECT id FROM attendance
      WHERE employee_id = $1 AND check_out IS NULL
      ORDER BY check_in DESC
      LIMIT 1
    )
    RETURNING *,
      ROUND((EXTRACT(EPOCH FROM (CURRENT_TIMESTAMP - check_in))/3600.0)::numeric, 2) AS total_hours
    `,
    [employeeId]
  );

  return result.rows[0];
};

// Create attendance manually
const createAttendance = async (data) => {
  const {
    employeeId,
    attendanceDate,
    checkIn,
    checkOut,
    status,
    notes,
    recordedBy,
  } = data;

  const result = await pool.query(
    `
    INSERT INTO attendance (
      employee_id,
      attendance_date,
      check_in,
      check_out,
      status,
      notes,
      recorded_by
    )
    VALUES ($1, $2, $3, $4, $5::attendance_status, $6, $7)
    RETURNING *
    `,
    [
      employeeId,
      attendanceDate,
      checkIn || null,
      checkOut || null,
      status || "present",
      notes || null,
      recordedBy || null,
    ]
  );

  return result.rows[0];
};

/**
 * Auto-mark absentees for a given shift date (run at 7:00 AM when the club night shift concludes).
 * Any active staff who did not check in and is not on approved leave is marked 'absent'.
 * Staff on approved leave are marked 'on_leave'.
 */
const autoMarkDailyAbsentees = async (targetDate = null) => {
  // If targetDate not given, default to yesterday's date (night shift that ends at 7:00 AM)
  const dateRes = await pool.query(
    `SELECT COALESCE($1::date, (CURRENT_DATE - INTERVAL '1 day')::date) AS shift_date`,
    [targetDate]
  );
  const shiftDate = dateRes.rows[0].shift_date;

  // Find active employees hired on or before shiftDate who have no attendance record
  const missingStaffQuery = `
    SELECT 
      e.id AS employee_id,
      e.employee_code,
      e.first_name,
      e.last_name,
      e.hire_date,
      lr.id AS leave_request_id
    FROM employees e
    LEFT JOIN attendance a 
      ON a.employee_id = e.id AND a.attendance_date = $1
    LEFT JOIN leave_requests lr 
      ON lr.employee_id = e.id 
      AND lr.status = 'approved'
      AND $1 BETWEEN lr.start_date AND lr.end_date
    WHERE e.status = 'active'
      AND (e.hire_date IS NULL OR e.hire_date <= $1)
      AND a.id IS NULL
  `;

  const { rows: missingStaff } = await pool.query(missingStaffQuery, [shiftDate]);

  if (missingStaff.length === 0) {
    return {
      date: shiftDate,
      markedAbsent: 0,
      markedOnLeave: 0,
      totalProcessed: 0,
      message: `No missing attendance records found for ${shiftDate}.`
    };
  }

  let markedAbsent = 0;
  let markedOnLeave = 0;

  for (const staff of missingStaff) {
    const isLeave = Boolean(staff.leave_request_id);
    const status = isLeave ? "on_leave" : "absent";
    const notes = isLeave
      ? "Auto-marked: Approved leave on schedule"
      : "Auto-marked absent: Night shift ended at 7:00 AM without check-in";

    await pool.query(
      `
      INSERT INTO attendance (
        employee_id,
        attendance_date,
        status,
        notes
      )
      VALUES ($1, $2, $3::attendance_status, $4)
      ON CONFLICT (employee_id, attendance_date) DO NOTHING
      `,
      [staff.employee_id, shiftDate, status, notes]
    );

    if (isLeave) markedOnLeave++;
    else markedAbsent++;
  }

  return {
    date: shiftDate,
    markedAbsent,
    markedOnLeave,
    totalProcessed: missingStaff.length,
    message: `Processed ${missingStaff.length} employees for ${shiftDate}: ${markedAbsent} absent, ${markedOnLeave} on leave.`
  };
};

/**
 * Catch-up missing attendance dates up to yesterday
 * Useful on system startup so that any days missed while the server was offline are backfilled.
 */
const catchUpMissedAbsentees = async () => {
  const datesRes = await pool.query(`
    SELECT d::date AS past_date
    FROM generate_series(
      DATE_TRUNC('month', CURRENT_DATE)::date,
      (CURRENT_DATE - INTERVAL '1 day')::date,
      INTERVAL '1 day'
    ) d
    ORDER BY d ASC
  `);

  const results = [];
  for (const row of datesRes.rows) {
    const res = await autoMarkDailyAbsentees(row.past_date);
    if (res.totalProcessed > 0) {
      results.push(res);
    }
  }

  return results;
};

module.exports = {
  getAllAttendance,
  getEmployeeAttendance,
  getTodayAttendance,
  checkIn,
  checkOut,
  createAttendance,
  autoMarkDailyAbsentees,
  catchUpMissedAbsentees,
};