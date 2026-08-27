const bcrypt = require("bcrypt");
const pool = require("../config/database");

const createAdmin = async () => {
  try {
    const password = "Admin@123";

    const passwordHash = await bcrypt.hash(password, 12);

    const roleResult = await pool.query(
      `
      SELECT id
      FROM roles
      WHERE name = 'admin'
      `
    );

    if (roleResult.rows.length === 0) {
      throw new Error("Admin role does not exist");
    }

    const roleId = roleResult.rows[0].id;

    const result = await pool.query(
      `
      INSERT INTO users (
        username,
        email,
        password_hash,
        role_id
      )
      VALUES ($1, $2, $3, $4)
      ON CONFLICT (username) DO NOTHING
      RETURNING id, username, email
      `,
      [
        "admin",
        "admin@rbms.com",
        passwordHash,
        roleId,
      ]
    );

    if (result.rows.length === 0) {
      console.log("ℹ️ Admin user already exists");
    } else {
      console.log("✅ Admin user created");
      console.log("Username: admin");
      console.log("Password: Admin@123");
    }
  } catch (error) {
    console.error("❌ Failed to create admin:", error);
  } finally {
    await pool.end();
  }
};

createAdmin();