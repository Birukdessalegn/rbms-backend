const fs = require("fs");
const path = require("path");
const pool = require("../config/database");

const initializeDatabase = async () => {
  try {
    const schemaPath = path.join(__dirname, "schema.sql");

    const schema = fs.readFileSync(schemaPath, "utf8");

    await pool.query(schema);

    console.log("✅ Database schema initialized");
  } catch (error) {
    console.error("❌ Failed to initialize database schema");
    console.error(error);

    throw error;
  }
};

module.exports = initializeDatabase;