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

module.exports = {
  getAllAttendance,
  getEmployeeAttendance,
  getTodayAttendance,
  checkIn,
  checkOut,
  createAttendance,
};