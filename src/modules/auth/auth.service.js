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
      r.name AS role
     FROM users u
     LEFT JOIN roles r ON u.role_id = r.id
     WHERE u.username = $1`,
    [username]
  );

  if (result.rows.length === 0) {
    throw new Error("Invalid username or password");
  }

  const user = result.rows[0];

  // Check account status
  if (user.status !== "active") {
    throw new Error("User account is not active");
  }

  // Compare password
  const passwordMatch = await bcrypt.compare(
    password,
    user.password_hash
  );

  if (!passwordMatch) {
    throw new Error("Invalid username or password");
  }

  // Create JWT
  const token = jwt.sign(
    {
      id: user.id,
      username: user.username,
      roleId: user.role_id,
      role: user.role,
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

  return {
    token,
    user: {
      id: user.id,
      username: user.username,
      email: user.email,
      roleId: user.role_id,
      role: user.role,
    },
  };
};

module.exports = {
  registerUser,
  loginUser,
};