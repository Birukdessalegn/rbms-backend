require("dotenv").config();

const app = require("./app");
const pool = require("./config/database");
const initializeDatabase = require("./database/init");

const PORT = process.env.PORT || 8000;

const startServer = async () => {
  try {
    await pool.query("SELECT NOW()");

    console.log("✅ Database connection successful");

    await initializeDatabase();

    // Bind to "0.0.0.0" so mobile devices on Wi-Fi can connect
    app.listen(PORT, "0.0.0.0", () => {
      console.log(
        `🚀 RBMS Backend running on port ${PORT} (Network accessible)`
      );
    });
  } catch (error) {
    console.error("❌ Failed to start RBMS backend");
    console.error(error);

    process.exit(1);
  }
};

startServer();
