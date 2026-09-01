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

    const firstName = employee.firstName || employee.first_name || "";
    const lastName = employee.lastName || employee.last_name || "";
    const phone = employee.phone || employee.mobile || null;
    const email = employee.email || null;
    const address = employee.address || null;
    const hireDate = employee.hireDate || employee.hire_date || null;
    const salary = employee.salary || 0;
    const username = employee.username;
    const password = employee.password;
    const employeeCode = employee.employeeCode || employee.employee_code || employee.code;
    const rawRole = employee.roleName || employee.role || employee.roleId || employee.role_id;
    const rawDept = employee.department || employee.departmentId || employee.department_id;

    // -----------------------------------------------------
    // VALIDATE LOGIN INFORMATION
    // -----------------------------------------------------

    if (!username) {
      throw new Error("Username is required");
    }

    if (!password) {
      throw new Error("Password is required");
    }

    if (!rawRole) {
      throw new Error("Role is required");
    }


    // -----------------------------------------------------
    // GENERATE OR CHECK UNIQUE EMPLOYEE CODE
    // -----------------------------------------------------

    let finalEmployeeCode = (
      employeeCode ||
      employee.employee_code ||
      employee.code ||
      ""
    ).trim();

    if (!finalEmployeeCode) {
      const lastEmpRes = await client.query(`
        SELECT employee_code FROM employees 
        WHERE employee_code LIKE 'EMP-%' 
        ORDER BY id DESC LIMIT 1
      `);
      let nextNum = 1;
      if (lastEmpRes.rows.length > 0) {
        const match = lastEmpRes.rows[0].employee_code.match(/EMP-(\d+)/i);
        if (match) {
          nextNum = parseInt(match[1], 10) + 1;
        }
      }
      finalEmployeeCode = `EMP-${String(nextNum).padStart(3, "0")}`;
    }

    const existingCodeCheck = await client.query(
      `SELECT id FROM employees WHERE LOWER(employee_code) = LOWER($1)`,
      [finalEmployeeCode]
    );

    if (existingCodeCheck.rows.length > 0) {
      if (employeeCode || employee.employee_code || employee.code) {
        throw new Error(
          `Employee code '${finalEmployeeCode}' is already in use. Please enter a different code.`
        );
      } else {
        const countRes = await client.query(`SELECT COUNT(*) FROM employees`);
        const count = parseInt(countRes.rows[0].count, 10) + 1;
        finalEmployeeCode = `EMP-${String(count).padStart(3, "0")}`;
      }
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
    // RESOLVE ROLE (Supports both Frontend role IDs & DB role names)
    // Frontend IDs: 1=admin, 2=manager, 3=hr, 4=finance, 5=cashier, 6=waiter, 7=chef, 8=bartender
    // -----------------------------------------------------

    let targetRoleName = null;
    const strRole = String(rawRole).trim();

    if (!isNaN(Number(strRole))) {
      const numId = Number(strRole);
      const frontendRoleMap = {
        1: "admin",
        2: "manager",
        3: "hr",
        4: "finance",
        5: "cashier",
        6: "waiter",
        7: "chef",
        8: "bartender",
      };
      if (frontendRoleMap[numId]) {
        targetRoleName = frontendRoleMap[numId];
      }
    } else {
      targetRoleName = strRole.toLowerCase();
    }

    let actualRoleId = null;
    if (targetRoleName) {
      const roleByName = await client.query(
        `SELECT id, name FROM roles WHERE LOWER(name) = LOWER($1)`,
        [targetRoleName]
      );
      if (roleByName.rows.length > 0) {
        actualRoleId = roleByName.rows[0].id;
      }
    }

    // Fallback lookup directly by DB ID if not matched by map
    if (!actualRoleId && !isNaN(Number(strRole))) {
      const roleById = await client.query(
        `SELECT id, name FROM roles WHERE id = $1`,
        [Number(strRole)]
      );
      if (roleById.rows.length > 0) {
        actualRoleId = roleById.rows[0].id;
      }
    }

    if (!actualRoleId) {
      throw new Error("Invalid role specified");
    }


    // -----------------------------------------------------
    // RESOLVE DEPARTMENT (Default based on chosen Role)
    // -----------------------------------------------------

    let actualDepartmentId = null;

    if (rawDept) {
      const strDept = String(rawDept).trim();

      if (isNaN(Number(strDept))) {
        const dByName = await client.query(
          `SELECT id FROM departments WHERE LOWER(name) = LOWER($1)`,
          [strDept]
        );
        if (dByName.rows.length > 0) {
          actualDepartmentId = dByName.rows[0].id;
        }
      }

      if (!actualDepartmentId) {
        const numDept = Number(strDept);
        if (!isNaN(numDept)) {
          const dById = await client.query(
            `SELECT id FROM departments WHERE id = $1`,
            [numDept]
          );
          if (dById.rows.length > 0) {
            actualDepartmentId = dById.rows[0].id;
          }
        }
      }
    }

    // Auto-assign default department based on chosen Role if department not explicitly set
    if (!actualDepartmentId) {
      if (actualRoleId === 4) actualDepartmentId = 6;      // Cashier -> Finance (6)
      else if (actualRoleId === 5) actualDepartmentId = 3; // Waiter -> Service (3)
      else if (actualRoleId === 6) actualDepartmentId = 4; // Chef -> Kitchen (4)
      else if (actualRoleId === 7) actualDepartmentId = 5; // Bartender -> Bar (5)
      else if (actualRoleId === 1 || actualRoleId === 2) actualDepartmentId = 1; // Admin / Manager -> Management (1)
      else if (actualRoleId === 3) actualDepartmentId = 2; // HR -> Human Resources (2)
      else if (actualRoleId === 8) actualDepartmentId = 6; // Finance -> Finance (6)
      else actualDepartmentId = 1;
    }


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
        user_id,
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
        $11,
        $12
      )

      RETURNING *
      `,
      [
        finalEmployeeCode,
        firstName,
        lastName,
        phone || null,
        email || null,
        address || null,
        actualRoleId,
        actualDepartmentId,
        user.id,
        hireDate || null,
        salary || 0,
        "active",
      ]
    );

    const createdEmployee = employeeResult.rows[0];

    const fullEmpRes = await client.query(
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
        e.user_id,

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
      [createdEmployee.id]
    );

    const fullEmployee = fullEmpRes.rows[0] || createdEmployee;

    // Return both
    return {
      employee: fullEmployee,
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        roleId: user.role_id,
        role: fullEmployee.role || "cashier",
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
    role_id,
    role,
    roleName,
    departmentId,
    department_id,
    hireDate,
    salary,
    status,
  } = employee;

  const rawRole = roleName || role || roleId || role_id;
  let actualRoleId = null;

  if (rawRole) {
    const strRole = String(rawRole).trim();
    if (isNaN(Number(strRole))) {
      const r = await pool.query(`SELECT id FROM roles WHERE LOWER(name) = LOWER($1)`, [strRole]);
      if (r.rows.length > 0) actualRoleId = r.rows[0].id;
    }
    if (!actualRoleId) {
      const numId = Number(strRole);
      if (!isNaN(numId)) {
        const r = await pool.query(`SELECT id FROM roles WHERE id = $1`, [numId]);
        if (r.rows.length > 0) actualRoleId = r.rows[0].id;
      }
    }
  }

  const result = await pool.query(
    `
    UPDATE employees

    SET
      employee_code = COALESCE($1, employee_code),
      first_name = COALESCE($2, first_name),
      last_name = COALESCE($3, last_name),
      phone = COALESCE($4, phone),
      email = COALESCE($5, email),
      address = COALESCE($6, address),
      role_id = COALESCE($7, role_id),
      department_id = COALESCE($8, department_id),
      hire_date = COALESCE($9, hire_date),
      salary = COALESCE($10, salary),
      status = COALESCE($11, status),
      updated_at = CURRENT_TIMESTAMP

    WHERE id = $12

    RETURNING *
    `,
    [
      employeeCode || null,
      firstName || null,
      lastName || null,
      phone || null,
      email || null,
      address || null,
      actualRoleId,
      departmentId || department_id || null,
      hireDate || null,
      salary || null,
      status || null,
      id,
    ]
  );

  const updatedEmployee = result.rows[0];

  // Sync role to user account if linked
  if (updatedEmployee && updatedEmployee.user_id && actualRoleId) {
    await pool.query(
      `UPDATE users SET role_id = $1 WHERE id = $2`,
      [actualRoleId, updatedEmployee.user_id]
    );
  }

  const fullEmpRes = await pool.query(
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
      e.user_id,

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

  return fullEmpRes.rows[0] || updatedEmployee;
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