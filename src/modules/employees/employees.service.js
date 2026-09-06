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
      e.user_id,
      u.username,

      r.id AS role_id,
      r.name AS role,

      d.id AS department_id,
      d.name AS department

    FROM employees e

    LEFT JOIN roles r
      ON e.role_id = r.id

    LEFT JOIN departments d
      ON e.department_id = d.id

    LEFT JOIN users u
      ON e.user_id = u.id

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
      e.user_id,
      u.username,

      r.id AS role_id,
      r.name AS role,

      d.id AS department_id,
      d.name AS department

    FROM employees e

    LEFT JOIN roles r
      ON e.role_id = r.id

    LEFT JOIN departments d
      ON e.department_id = d.id

    LEFT JOIN users u
      ON e.user_id = u.id

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
        9: "fb_controller",
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
      else if (targetRoleName === "fb_controller") {
        const fbDept = await client.query("SELECT id FROM departments WHERE LOWER(name) = 'food & beverage' LIMIT 1");
        if (fbDept.rows.length > 0) actualDepartmentId = fbDept.rows[0].id;
        else actualDepartmentId = 1;
      }
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

    await client.query("COMMIT");

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
    employee_code,
    firstName,
    first_name,
    lastName,
    last_name,
    phone,
    email,
    address,
    roleId,
    role_id,
    role,
    roleName,
    departmentId,
    department_id,
    department,
    departmentName,
    hireDate,
    hire_date,
    salary,
    status,
    username,
    password,
  } = employee;

  // 1. Resolve Role ID (prioritize name e.g. 'Chef', and map frontend IDs accurately)
  let actualRoleId = null;
  const rawRoleStr = roleName || role;
  if (rawRoleStr && isNaN(Number(rawRoleStr))) {
    const r = await pool.query(
      `SELECT id FROM roles WHERE LOWER(name) = LOWER($1) LIMIT 1`,
      [String(rawRoleStr).trim()]
    );
    if (r.rows.length > 0) actualRoleId = r.rows[0].id;
  }

  if (!actualRoleId && (roleId || role_id || rawRoleStr)) {
    const rawNum = Number(roleId || role_id || rawRoleStr);
    if (!isNaN(rawNum)) {
      const frontendRoleMap = {
        1: "admin",
        2: "manager",
        3: "hr",
        4: "finance",
        5: "cashier",
        6: "waiter",
        7: "chef",
        8: "bartender",
        9: "fb_controller",
      };
      if (frontendRoleMap[rawNum]) {
        const r = await pool.query(
          `SELECT id FROM roles WHERE LOWER(name) = LOWER($1) LIMIT 1`,
          [frontendRoleMap[rawNum]]
        );
        if (r.rows.length > 0) actualRoleId = r.rows[0].id;
      }
      if (!actualRoleId) {
        const r = await pool.query(`SELECT id FROM roles WHERE id = $1`, [rawNum]);
        if (r.rows.length > 0) actualRoleId = r.rows[0].id;
      }
    }
  }

  // 2. Resolve Department ID (prioritize name e.g. 'Kitchen', 'Bar', etc.)
  let actualDeptId = null;
  const rawDeptStr = departmentName || department;
  if (rawDeptStr && isNaN(Number(rawDeptStr))) {
    const d = await pool.query(
      `SELECT id FROM departments WHERE LOWER(name) = LOWER($1) LIMIT 1`,
      [String(rawDeptStr).trim()]
    );
    if (d.rows.length > 0) actualDeptId = d.rows[0].id;
  }

  if (!actualDeptId && (departmentId || department_id || rawDeptStr)) {
    const rawDeptNum = Number(departmentId || department_id || rawDeptStr);
    if (!isNaN(rawDeptNum)) {
      const d = await pool.query(`SELECT id FROM departments WHERE id = $1`, [rawDeptNum]);
      if (d.rows.length > 0) actualDeptId = d.rows[0].id;
    }
  }

  // 3. Update the Employee record (with safe ::employee_status cast)
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
      status = COALESCE($11::employee_status, status),
      updated_at = CURRENT_TIMESTAMP
    WHERE id = $12
    RETURNING *
    `,
    [
      employeeCode || employee_code || null,
      firstName || first_name || null,
      lastName || last_name || null,
      phone || null,
      email || null,
      address || null,
      actualRoleId,
      actualDeptId,
      hireDate || hire_date || null,
      salary !== undefined && salary !== null && salary !== "" ? Number(salary) : null,
      status || null,
      id,
    ]
  );

  const updatedEmployee = result.rows[0];

  // 4. Update linked User account credentials if employee has a user_id
  if (updatedEmployee && updatedEmployee.user_id) {
    const userUpdates = [];
    const userParams = [];
    let pIdx = 1;

    // Update username if provided
    if (username && String(username).trim()) {
      userUpdates.push(`username = $${pIdx++}`);
      userParams.push(String(username).trim());
    }

    // Update password (hashed) if a new password was entered (stored in password_hash)
    if (password && String(password).trim()) {
      const hashedPassword = await bcrypt.hash(String(password).trim(), 10);
      userUpdates.push(`password_hash = $${pIdx++}`);
      userParams.push(hashedPassword);
    }

    // Keep user role_id in sync
    if (actualRoleId) {
      userUpdates.push(`role_id = $${pIdx++}`);
      userParams.push(actualRoleId);
    }

    // Keep user email in sync
    if (email && String(email).trim()) {
      userUpdates.push(`email = $${pIdx++}`);
      userParams.push(String(email).trim());
    }

    if (userUpdates.length > 0) {
      userParams.push(updatedEmployee.user_id);
      await pool.query(
        `UPDATE users SET ${userUpdates.join(", ")}, updated_at = CURRENT_TIMESTAMP WHERE id = $${pIdx}`,
        userParams
      );
    }
  }

  // 5. Fetch and return full updated employee record with role & user info
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
      d.name AS department,
      u.username
    FROM employees e
    LEFT JOIN roles r
      ON e.role_id = r.id
    LEFT JOIN departments d
      ON e.department_id = d.id
    LEFT JOIN users u
      ON e.user_id = u.id
    WHERE e.id = $1
    `,
    [id]
  );

  return fullEmpRes.rows[0] || updatedEmployee;
};


// =========================================================
// DEACTIVATE EMPLOYEE (Synchronizes User Account)
// =========================================================

const deleteEmployee = async (id) => {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const result = await client.query(
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

    if (result.rows.length === 0) {
      await client.query("ROLLBACK");
      return null;
    }

    const employee = result.rows[0];

    // Also deactivate linked user account so they cannot log in
    if (employee.user_id) {
      await client.query(
        `
        UPDATE users
        SET
          status = 'inactive',
          updated_at = CURRENT_TIMESTAMP
        WHERE id = $1
        `,
        [employee.user_id]
      );
    }

    await client.query("COMMIT");
    return employee;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
};

// =========================================================
// ACTIVATE EMPLOYEE (Synchronizes User Account)
// =========================================================

const activateEmployee = async (id) => {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const result = await client.query(
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

    if (result.rows.length === 0) {
      await client.query("ROLLBACK");
      return null;
    }

    const employee = result.rows[0];

    // Also reactivate linked user account
    if (employee.user_id) {
      await client.query(
        `
        UPDATE users
        SET
          status = 'active',
          updated_at = CURRENT_TIMESTAMP
        WHERE id = $1
        `,
        [employee.user_id]
      );
    }

    await client.query("COMMIT");
    return employee;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
};

// =========================================================
// DELETE EMPLOYEE LOGIN ACCOUNT ONLY (Preserves Sales/Work History)
// =========================================================

const deleteEmployeeAccount = async (id) => {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // 1. Fetch employee to find user_id
    const empRes = await client.query(
      `SELECT id, first_name, last_name, user_id FROM employees WHERE id = $1`,
      [id]
    );

    if (empRes.rows.length === 0) {
      await client.query("ROLLBACK");
      return null;
    }

    const employee = empRes.rows[0];
    const userId = employee.user_id;

    if (!userId) {
      await client.query("ROLLBACK");
      return { employee, message: "Employee does not have an active login account" };
    }

    // 2. Disconnect login account from employee record
    await client.query(
      `UPDATE employees SET user_id = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = $1`,
      [id]
    );

    // 3. Delete or permanently sanitize user account so credentials can never be used
    try {
      // Attempt hard delete if no historical foreign keys exist
      await client.query(`DELETE FROM users WHERE id = $1`, [userId]);
    } catch (fkErr) {
      // If historical orders/shifts/payments reference this user ID, permanently disable credentials
      await client.query(
        `
        UPDATE users
        SET
          status = 'inactive',
          password_hash = 'DISABLED_' || gen_random_uuid(),
          username = 'disabled_user_' || substring(id::text, 1, 8),
          email = NULL,
          updated_at = CURRENT_TIMESTAMP
        WHERE id = $1
        `,
        [userId]
      );
    }

    await client.query("COMMIT");

    return {
      success: true,
      message: "Employee login account deleted successfully. Work and sales history preserved.",
    };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
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
  deleteEmployeeAccount,
};