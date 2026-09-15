require("dotenv").config();

const app = require("./app");
const pool = require("./config/database");
const initializeDatabase = require("./database/init");

const PORT = process.env.PORT || 8000;

const startServer = async () => {
  try {
    await pool.query("SELECT NOW()");

    console.log("✅ Database connection successful");

    // Initialize database schema and auto-run migrations
    try {
      await initializeDatabase();
    } catch (dbErr) {
      console.warn("⚠️ Database initialization check notice:", dbErr.message);
    }

    // Bind to "0.0.0.0" so mobile devices on Wi-Fi can connect
    app.listen(PORT, "0.0.0.0", () => {
      console.log(
        `🚀 RBMS Backend running on port ${PORT} (Network accessible)`
      );

      // Initialize recurring expenses automated check & notification scheduler
      try {
        const { checkDueRecurringExpensesAndNotify } = require("./modules/expenses/recurringExpenses.service");
        // Initial run 5 seconds after startup
        setTimeout(() => {
          checkDueRecurringExpensesAndNotify().catch((err) =>
            console.error("Initial recurring expense check failed:", err)
          );
        }, 5000);

        // Periodic check every 2 hours
        setInterval(() => {
          checkDueRecurringExpensesAndNotify().catch((err) =>
            console.error("Scheduled recurring expense check failed:", err)
          );
        }, 2 * 60 * 60 * 1000);

        console.log("⏰ Recurring expenses reminder scheduler started");
      } catch (schedErr) {
        console.error("Failed to start recurring expenses scheduler:", schedErr);
      }
    });
  } catch (error) {
    console.error("❌ Failed to start RBMS backend");
    console.error(error);

    process.exit(1);
  }
};

startServer();
