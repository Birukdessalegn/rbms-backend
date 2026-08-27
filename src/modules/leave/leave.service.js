const pool = require("../../config/database");

// ============================================================
// GET ALL LEAVE REQUESTS
// ============================================================

const getAllLeaveRequests = async () => {
  const result = await pool.query(`
    SELECT
      lr.id,
      lr.start_date,
      lr.end_date,
      lr.total_days,
      lr.reason,
      lr.status,
      lr.requested_at,
      lr.reviewed_at,
      lr.manager_comment,

      e.id AS employee_id,
      e.employee_code,
      e.first_name,
      e.last_name,
      e.phone,

      lt.id AS leave_type_id,
      lt.name AS leave_type

    FROM leave_requests lr

    JOIN employees e
      ON lr.employee_id = e.id

    LEFT JOIN leave_types lt
      ON lr.leave_type_id = lt.id

    ORDER BY lr.requested_at DESC
  `);

  return result.rows;
};


// ============================================================
// GET LEAVE REQUEST BY ID
// ============================================================

const getLeaveRequestById = async (id) => {
  const result = await pool.query(
    `
    SELECT
      lr.id,
      lr.start_date,
      lr.end_date,
      lr.total_days,
      lr.reason,
      lr.status,
      lr.requested_at,
      lr.reviewed_at,
      lr.manager_comment,

      e.id AS employee_id,
      e.employee_code,
      e.first_name,
      e.last_name,
      e.phone,
      e.email,
      e.address,

      d.name AS department,

      r.name AS role,

      lt.id AS leave_type_id,
      lt.name AS leave_type

    FROM leave_requests lr

    JOIN employees e
      ON lr.employee_id = e.id

    LEFT JOIN departments d
      ON e.department_id = d.id

    LEFT JOIN roles r
      ON e.role_id = r.id

    LEFT JOIN leave_types lt
      ON lr.leave_type_id = lt.id

    WHERE lr.id = $1
    `,
    [id]
  );

  return result.rows[0];
};


// ============================================================
// CREATE LEAVE REQUEST
// ============================================================

const createLeaveRequest = async (data) => {
  const {
    employeeId,
    leaveTypeId,
    startDate,
    endDate,
    totalDays,
    reason,
  } = data;

  const result = await pool.query(
    `
    INSERT INTO leave_requests (
      employee_id,
      leave_type_id,
      start_date,
      end_date,
      total_days,
      reason
    )
    VALUES ($1, $2, $3, $4, $5, $6)
    RETURNING *
    `,
    [
      employeeId,
      leaveTypeId || null,
      startDate,
      endDate,
      totalDays,
      reason || null,
    ]
  );

  return result.rows[0];
};


// ============================================================
// APPROVE LEAVE REQUEST
// ============================================================

const approveLeaveRequest = async (id, reviewedBy, managerComment) => {
  const result = await pool.query(
    `
    UPDATE leave_requests
    SET
      status = 'approved',
      reviewed_by = $2,
      reviewed_at = CURRENT_TIMESTAMP,
      manager_comment = $3
    WHERE id = $1
      AND status = 'pending'
    RETURNING *
    `,
    [
      id,
      reviewedBy || null,
      managerComment || null,
    ]
  );

  return result.rows[0];
};


// ============================================================
// REJECT LEAVE REQUEST
// ============================================================

const rejectLeaveRequest = async (id, reviewedBy, managerComment) => {
  const result = await pool.query(
    `
    UPDATE leave_requests
    SET
      status = 'rejected',
      reviewed_by = $2,
      reviewed_at = CURRENT_TIMESTAMP,
      manager_comment = $3
    WHERE id = $1
      AND status = 'pending'
    RETURNING *
    `,
    [
      id,
      reviewedBy || null,
      managerComment || null,
    ]
  );

  return result.rows[0];
};


module.exports = {
  getAllLeaveRequests,
  getLeaveRequestById,
  createLeaveRequest,
  approveLeaveRequest,
  rejectLeaveRequest,
};