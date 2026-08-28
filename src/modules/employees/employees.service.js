const bcrypt = require("bcryptjs");
const pool = require("../../config/database");

// =========================================================
// GET ALL EMPLOYEES
// =========================================================

const getAllEmployees = async () => {
  const result = await pool.query(`
    SELECT
      e.id,
      e.employee_code,
      e.first_name,
      e.last_name,
      e.phone,
      e.email,
      e.address,
      e.hire_date,
      e.salary,
      e.status,

      r.id AS role_id,
      r.name AS role,

      d.id AS department_id,
      d.name AS department

    FROM employees e

    LEFT JOIN roles r
      ON e.role_id = r.id

    LEFT JOIN departments d
      ON e.department_id = d.id

    ORDER BY e.id DESC
  `);

  return result.rows;
};


// =========================================================
// GET EMPLOYEE BY ID
// =========================================================

const getEmployeeById = async (id) => {
  const result = await pool.query(
    `
    SELECT
      e.id,
      e.employee_code,
      e.first_name,
      e.last_name,
      e.phone,
      e.email,
      e.address,
      e.hire_date,
      e.salary,
      e.status,

      r.id AS role_id,
      r.name AS role,

      d.id AS department_id,
      d.name AS department

    FROM employees e

    LEFT JOIN roles r
      ON e.role_id = r.id

    LEFT JOIN departments d
      ON e.department_id = d.id

    WHERE e.id = $1
    `,
    [id]
  );

  return result.rows[0];
};


// =========================================================
// CREATE EMPLOYEE + USER ACCOUNT
// =========================================================

const createEmployee = async (employee) => {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const {
      employeeCode,
      firstName,
      lastName,
      phone,
      email,
      address,
      roleId,
      departmentId,
      hireDate,
      salary,

      // Login credentials
      username,
      password,
    } = employee;


    // -----------------------------------------------------
    // VALIDATE LOGIN INFORMATION
    // -----------------------------------------------------

    if (!username) {
      throw new Error("Username is required");
    }

    if (!password) {
      throw new Error("Password is required");
    }

    if (!roleId) {
      throw new Error("Role is required");
    }


    // -----------------------------------------------------
    // CHECK USERNAME
    // -----------------------------------------------------

    const existingUsername = await client.query(
      `
      SELECT id
      FROM users
      WHERE username = $1
      `,
      [username]
    );

    if (existingUsername.rows.length > 0) {
      throw new Error("Username already exists");
    }


    // -----------------------------------------------------
    // CHECK EMAIL
    // -----------------------------------------------------

    if (email) {
      const existingEmail = await client.query(
        `
        SELECT id
        FROM users
        WHERE email = $1
        `,
        [email]
      );

      if (existingEmail.rows.length > 0) {
        throw new Error("Email already exists");
      }
    }


    // -----------------------------------------------------
    // CHECK ROLE (Support both integer role ID and role name string)
    // -----------------------------------------------------

    const isNumericRole = !isNaN(parseInt(roleId, 10)) && String(roleId).trim().match(/^[0-9]+$/);
    const roleResult = await client.query(
      isNumericRole
        ? `SELECT id, name FROM roles WHERE id = $1`
        : `SELECT id, name FROM roles WHERE LOWER(name) = LOWER($1)`,
      [isNumericRole ? parseInt(roleId, 10) : String(roleId).trim()]
    );

    if (roleResult.rows.length === 0) {
      throw new Error("Invalid role specified");
    }

    const actualRoleId = roleResult.rows[0].id;


    // -----------------------------------------------------
    // HASH PASSWORD
    // -----------------------------------------------------

    const passwordHash = await bcrypt.hash(password, 10);


    // -----------------------------------------------------
    // CREATE USER ACCOUNT
    // -----------------------------------------------------

    const userResult = await client.query(
      `
      INSERT INTO users (
        username,
        email,
        password_hash,
        role_id,
        status
      )
      VALUES ($1, $2, $3, $4, $5)

      RETURNING
        id,
        username,
        email,
        role_id,
        status,
        created_at
      `,
      [
        username,
        email || null,
        passwordHash,
        actualRoleId,
        "active",
      ]
    );

    const user = userResult.rows[0];


    // -----------------------------------------------------
    // CREATE EMPLOYEE
    // -----------------------------------------------------

    const employeeResult = await client.query(
      `
      INSERT INTO employees (
        employee_code,
        first_name,
        last_name,
        phone,
        email,
        address,
        role_id,
        department_id,
        hire_date,
        salary,
        status
      )

      VALUES (
        $1,
        $2,
        $3,
        $4,
        $5,
        $6,
        $7,
        $8,
        $9,
        $10,
        $11
      )

      RETURNING *
      `,
      [
        employeeCode,
        firstName,
        lastName,
        phone || null,
        email || null,
        address || null,
        actualRoleId,
        departmentId || null,
        hireDate || null,
        salary || 0,
        "active",
      ]
    );

    const createdEmployee = employeeResult.rows[0];


    // -----------------------------------------------------
    // COMMIT
    // -----------------------------------------------------

    await client.query("COMMIT");


    // Return both
    return {
      employee: createdEmployee,
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        roleId: user.role_id,
        status: user.status,
      },
    };

  } catch (error) {

    // Roll everything back
    await client.query("ROLLBACK");

    throw error;

  } finally {

    client.release();

  }
};


// =========================================================
// UPDATE EMPLOYEE
// =========================================================

const updateEmployee = async (id, employee) => {
  const {
    employeeCode,
    firstName,
    lastName,
    phone,
    email,
    address,
    roleId,
    departmentId,
    hireDate,
    salary,
    status,
  } = employee;

  const result = await pool.query(
    `
    UPDATE employees

    SET
      employee_code = $1,
      first_name = $2,
      last_name = $3,
      phone = $4,
      email = $5,
      address = $6,
      role_id = $7,
      department_id = $8,
      hire_date = $9,
      salary = $10,
      status = $11,
      updated_at = CURRENT_TIMESTAMP

    WHERE id = $12

    RETURNING *
    `,
    [
      employeeCode,
      firstName,
      lastName,
      phone || null,
      email || null,
      address || null,
      roleId || null,
      departmentId || null,
      hireDate || null,
      salary || 0,
      status || "active",
      id,
    ]
  );

  return result.rows[0];
};


// =========================================================
// DEACTIVATE EMPLOYEE
// =========================================================

const deleteEmployee = async (id) => {
  const result = await pool.query(
    `
    UPDATE employees
    SET
      status = 'inactive',
      updated_at = CURRENT_TIMESTAMP
    WHERE id = $1
    RETURNING *
    `,
    [id]
  );

  return result.rows[0];
};

// =========================================================
// ACTIVATE EMPLOYEE
// =========================================================

const activateEmployee = async (id) => {
  const result = await pool.query(
    `
    UPDATE employees
    SET
      status = 'active',
      updated_at = CURRENT_TIMESTAMP
    WHERE id = $1
    RETURNING *
    `,
    [id]
  );

  return result.rows[0];
};


// =========================================================
// EXPORT
// =========================================================

module.exports = {
  getAllEmployees,
  getEmployeeById,
  createEmployee,
  updateEmployee,
  deleteEmployee,
  activateEmployee,
};