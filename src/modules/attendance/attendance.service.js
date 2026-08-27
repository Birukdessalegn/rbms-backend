const pool = require("../../config/database");

// Get all attendance records
const getAllAttendance = async () => {
  const result = await pool.query(`
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
      a.created_at,
      a.updated_at
    FROM attendance a
    JOIN employees e ON a.employee_id = e.id
    LEFT JOIN departments d ON e.department_id = d.id
    LEFT JOIN roles r ON e.role_id = r.id
    ORDER BY a.attendance_date DESC, a.check_in DESC
  `);

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
      a.notes
    FROM attendance a
    JOIN employees e ON a.employee_id = e.id
    WHERE a.employee_id = $1
    ORDER BY a.attendance_date DESC
    `,
    [employeeId]
  );

  return result.rows;
};


// Get today's attendance
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
      a.notes
    FROM attendance a
    JOIN employees e ON a.employee_id = e.id
    LEFT JOIN departments d ON e.department_id = d.id
    LEFT JOIN roles r ON e.role_id = r.id
    WHERE a.attendance_date = CURRENT_DATE
    ORDER BY a.check_in ASC
  `);

  return result.rows;
};


// Check in employee
const checkIn = async (employeeId, notes = null) => {
  const result = await pool.query(
    `
    INSERT INTO attendance (
      employee_id,
      attendance_date,
      check_in,
      status,
      notes
    )
    VALUES (
      $1,
      CURRENT_DATE,
      CURRENT_TIMESTAMP,
      'present',
      $2
    )
    ON CONFLICT (employee_id, attendance_date)
    DO UPDATE SET
      check_in = COALESCE(attendance.check_in, CURRENT_TIMESTAMP),
      status = 'present',
      notes = COALESCE(EXCLUDED.notes, attendance.notes),
      updated_at = CURRENT_TIMESTAMP
    RETURNING *
    `,
    [employeeId, notes]
  );

  return result.rows[0];
};


// Check out employee
const checkOut = async (employeeId) => {
  const result = await pool.query(
    `
    UPDATE attendance
    SET
      check_out = CURRENT_TIMESTAMP,
      updated_at = CURRENT_TIMESTAMP
    WHERE employee_id = $1
      AND attendance_date = CURRENT_DATE
    RETURNING *
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
    VALUES ($1, $2, $3, $4, $5, $6, $7)
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