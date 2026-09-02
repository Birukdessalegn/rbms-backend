
const { Pool, types } = require("pg");
require("dotenv").config();

// Parse TIMESTAMP (OID 1114) directly as string to preserve exact local time
types.setTypeParser(1114, (val) => val);

const poolConfig = process.env.DATABASE_URL
  ? {
      connectionString: process.env.DATABASE_URL,

      // SSL is required for Render PostgreSQL
      ssl:
        process.env.NODE_ENV === "production"
          ? { rejectUnauthorized: false }
          : false,
    }
  : {
      // Local PostgreSQL configuration
      host: process.env.DB_HOST,
      port: process.env.DB_PORT,
      database: process.env.DB_NAME,
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
    };

const pool = new Pool(poolConfig);

pool.on("connect", (client) => {
  client.query("SET timezone = 'Africa/Addis_Ababa'");
  console.log("✅ PostgreSQL connected");
});

pool.on("error", (err) => {
  console.error("❌ PostgreSQL error:", err);
});

module.exports = pool;