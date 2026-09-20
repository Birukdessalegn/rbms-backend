const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const pool = require("../../config/database");

const registerUser = async ({
  username,
  email,
  password,
  roleId,
}) => {
  // Check if username already exists
  const existingUser = await pool.query(
    "SELECT id FROM users WHERE username = $1",
    [username]
  );

  if (existingUser.rows.length > 0) {
    throw new Error("Username already exists");
  }

  // Hash password
  const passwordHash = await bcrypt.hash(password, 10);

  // Create user
  const result = await pool.query(
    `INSERT INTO users
      (username, email, password_hash, role_id)
     VALUES ($1, $2, $3, $4)
     RETURNING id, username, email, role_id, status, created_at`,
    [username, email || null, passwordHash, roleId || null]
  );

  return result.rows[0];
};

const loginUser = async (username, password) => {
  const result = await pool.query(
    `SELECT
      u.id,
      u.username,
      u.email,
      u.password_hash,
      u.role_id,
      u.status,
      r.name AS role,
      e.id AS employee_id,
      e.employee_code,
      e.first_name,
      e.last_name,
      TRIM(CONCAT(e.first_name, ' ', e.last_name)) AS employee_name,
      e.status AS employee_status
     FROM users u
     LEFT JOIN roles r ON u.role_id = r.id
     LEFT JOIN LATERAL (
       SELECT id, employee_code, first_name, last_name, phone, status
       FROM employees
       WHERE user_id = u.id
          OR (u.email IS NOT NULL AND email IS NOT NULL AND LOWER(email) = LOWER(u.email))
          OR (LOWER(first_name) = LOWER(u.username))
       ORDER BY
         CASE
           WHEN user_id = u.id THEN 1
           WHEN u.email IS NOT NULL AND email IS NOT NULL AND LOWER(email) = LOWER(u.email) THEN 2
           ELSE 3
         END ASC
       LIMIT 1
     ) e ON true
     WHERE LOWER(TRIM(u.username)) = LOWER(TRIM($1))`,
    [username]
  );

  if (result.rows.length === 0) {
    throw new Error("Invalid username or password");
  }

  const user = result.rows[0];

  console.log("LOGIN DEBUG:", {
    username: user.username,
    userId: user.id,
    roleId: user.role_id,
    status: user.status,
    employeeStatus: user.employee_status,
  });

  // Check account status and linked employee status
  if (user.status !== "active" || (user.employee_status && user.employee_status !== "active")) {
    throw new Error("Your account has been deactivated. Please contact management.");
  }

  // Compare password
  const passwordMatch = await bcrypt.compare(
    password,
    user.password_hash
  );

  if (!passwordMatch) {
    throw new Error("Invalid username or password");
  }

  // Enforce attendance check-in for Waiters and Bartenders
  const roleName = user.role?.toLowerCase();
  if (roleName === "waiter" || roleName === "bartender") {
    const employeeRes = await pool.query(
      "SELECT id FROM employees WHERE user_id = $1",
      [user.id]
    );

    if (employeeRes.rows.length === 0) {
      throw new Error(
        "No employee record associated with this account. Please contact management."
      );
    }

    const employeeId = employeeRes.rows[0].id;

    // Check if there is an active check-in record for current shift
    const attendanceCheck = await pool.query(
      `
      SELECT id FROM attendance
      WHERE employee_id = $1
        AND attendance_date = (
          CASE
            WHEN EXTRACT(HOUR FROM CURRENT_TIME) < 7 THEN CURRENT_DATE - 1
            ELSE CURRENT_DATE
          END
        )
        AND check_in IS NOT NULL
      `,
      [employeeId]
    );

    if (attendanceCheck.rows.length === 0) {
      throw new Error(
        "Attendance check-in required before logging in. Please ask HR or Management to check you in first."
      );
    }
  }

  // Create JWT
  const token = jwt.sign(
    {
      id: user.id,
      username: user.username,
      roleId: user.role_id,
      role: user.role,
      employee_id: user.employee_id || null,
      employeeId: user.employee_id || null,
    },
    process.env.JWT_SECRET,
    {
      expiresIn: "1d",
    }
  );

  // Update last login
  await pool.query(
    "UPDATE users SET last_login = CURRENT_TIMESTAMP WHERE id = $1",
    [user.id]
  );

  const empName = user.employee_name && user.employee_name.trim() !== "" ? user.employee_name.trim() : null;

  return {
    token,
    user: {
      id: user.id,
      username: user.username,
      email: user.email,
      roleId: user.role_id,
      role: user.role,
      employee_id: user.employee_id || null,
      employeeId: user.employee_id || null,
      employee_code: user.employee_code || null,
      first_name: user.first_name || null,
      last_name: user.last_name || null,
      employee_name: empName,
      name: empName || user.username,
    },
  };
};

const getProfile = async (userId) => {
  const result = await pool.query(
    `SELECT
      u.id,
      u.username,
      u.email,
      u.role_id,
      u.status,
      r.name AS role,
      e.id AS employee_id,
      e.employee_code,
      e.first_name,
      e.last_name,
      TRIM(CONCAT(e.first_name, ' ', e.last_name)) AS employee_name,
      e.phone
     FROM users u
     LEFT JOIN roles r ON u.role_id = r.id
     LEFT JOIN LATERAL (
       SELECT id, employee_code, first_name, last_name, phone, status
       FROM employees
       WHERE user_id = u.id
          OR (u.email IS NOT NULL AND email IS NOT NULL AND LOWER(email) = LOWER(u.email))
          OR (LOWER(first_name) = LOWER(u.username))
       ORDER BY
         CASE
           WHEN user_id = u.id THEN 1
           WHEN u.email IS NOT NULL AND email IS NOT NULL AND LOWER(email) = LOWER(u.email) THEN 2
           ELSE 3
         END ASC
       LIMIT 1
     ) e ON true
     WHERE u.id = $1`,
    [userId]
  );

  if (result.rows.length === 0) {
    throw new Error("User not found");
  }

  const user = result.rows[0];
  const empName = user.employee_name && user.employee_name.trim() !== "" ? user.employee_name.trim() : null;

  return {
    id: user.id,
    username: user.username,
    email: user.email,
    roleId: user.role_id,
    role: user.role,
    employee_id: user.employee_id || null,
    employeeId: user.employee_id || null,
    employee_code: user.employee_code || null,
    first_name: user.first_name || null,
    last_name: user.last_name || null,
    employee_name: empName,
    name: empName || user.username,
    phone: user.phone || null,
  };
};

const changePassword = async (userId, currentPassword, newPassword) => {
  if (!currentPassword || !newPassword) {
    throw new Error("Current password and new password are required");
  }

  if (typeof newPassword !== "string" || newPassword.trim().length < 6) {
    throw new Error("New password must be at least 6 characters long");
  }

  const result = await pool.query(
    "SELECT id, password_hash FROM users WHERE id = $1",
    [userId]
  );

  if (result.rows.length === 0) {
    throw new Error("User not found");
  }

  const user = result.rows[0];

  const isMatch = await bcrypt.compare(currentPassword, user.password_hash);
  if (!isMatch) {
    throw new Error("Incorrect current password");
  }

  const hashedNewPassword = await bcrypt.hash(newPassword.trim(), 10);
  await pool.query(
    "UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2",
    [hashedNewPassword, userId]
  );

  return { success: true };
};

module.exports = {
  registerUser,
  loginUser,
  getProfile,
  changePassword,
};