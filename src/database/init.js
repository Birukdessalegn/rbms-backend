const fs = require("fs");
const path = require("path");
const pool = require("../config/database");

const initializeDatabase = async () => {
  try {
    const schemaPath = path.join(__dirname, "schema.sql");

    const schema = fs.readFileSync(schemaPath, "utf8");

    await pool.query(schema);

    // Auto-migrate existing payments table if missing image_url or receipt_image column
    await pool.query(`
      ALTER TABLE payments ADD COLUMN IF NOT EXISTS image_url TEXT;
      ALTER TABLE payments ADD COLUMN IF NOT EXISTS receipt_image TEXT;
      ALTER TABLE restaurant_tables ADD COLUMN IF NOT EXISTS current_waiter_id INTEGER;
    `);

    // Auto-link missing user_id on employees table
    await pool.query(`
      UPDATE employees e
      SET user_id = u.id
      FROM users u
      WHERE e.user_id IS NULL AND u.id = (
        SELECT u2.id FROM users u2 
        WHERE (LOWER(u2.email) = LOWER(e.email) AND e.email IS NOT NULL AND e.email != '')
           OR (LOWER(u2.username) = LOWER(e.employee_code) AND e.employee_code IS NOT NULL AND e.employee_code != '')
        LIMIT 1
      );
    `);

    // Sync employee role_id with user role_id if they differ
    await pool.query(`
      UPDATE employees e
      SET role_id = u.role_id
      FROM users u
      WHERE e.user_id = u.id AND e.role_id IS DISTINCT FROM u.role_id;
    `);

    // Ensure cashier users ('kebe', 'emeye', 'yeshiwas') and any username containing 'cashier' have role_id = 4
    await pool.query(`
      UPDATE users SET role_id = 4 WHERE LOWER(username) LIKE '%cashier%' OR LOWER(username) IN ('kebe', 'yeshwaschashier');
      UPDATE employees SET role_id = 4 WHERE department_id = 6 OR employee_code IN ('EMP-013', 'EMP-015') OR LOWER(first_name) IN ('emeye', 'yeshiwas');
      UPDATE users SET role_id = 4 WHERE id IN (SELECT user_id FROM employees WHERE role_id = 4 AND user_id IS NOT NULL);
    `);

    // Normalize finance role ID from 480 to 8 and reset roles_id_seq
    await pool.query(`
      DO $$
      BEGIN
        IF EXISTS (SELECT 1 FROM roles WHERE name = 'finance' AND id = 480) THEN
          UPDATE users SET role_id = 8 WHERE role_id = 480;
          UPDATE employees SET role_id = 8 WHERE role_id = 480;
          UPDATE roles SET id = 8 WHERE name = 'finance' AND id = 480;
          PERFORM setval('roles_id_seq', (SELECT MAX(id) FROM roles));
        END IF;
      END $$;
    `);

    console.log("✅ Database schema initialized");
  } catch (error) {
    console.error("❌ Failed to initialize database schema");
    console.error(error);

    throw error;
  }
};

module.exports = initializeDatabase;