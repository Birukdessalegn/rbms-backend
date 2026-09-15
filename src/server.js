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

      // Initialize Daily 7:00 AM Night-Shift Absentee Auto-Marker Scheduler
      try {
        const { autoMarkDailyAbsentees, catchUpMissedAbsentees } = require("./modules/attendance/attendance.service");

        // 1. Initial catch-up for past missed dates on startup (after 10s)
        setTimeout(async () => {
          try {
            console.log("🔍 Checking and catching up missed absentee records on startup...");
            const catchUpResults = await catchUpMissedAbsentees();
            if (catchUpResults.length > 0) {
              console.log(`✅ Backfilled missing attendance records for ${catchUpResults.length} past dates`);
            } else {
              console.log("✅ Attendance records are fully up to date");
            }

            // Also check if current time is >= 7 AM and today's shift end (yesterday) needs marking
            const now = new Date();
            if (now.getHours() >= 7) {
              const res = await autoMarkDailyAbsentees();
              if (res.totalProcessed > 0) {
                console.log(`✅ Morning shift absentee check completed: ${res.message}`);
              }
            }
          } catch (autoErr) {
            console.error("Attendance auto-mark initial run warning:", autoErr.message);
          }
        }, 10000);

        // 2. Periodic check every 15 minutes for the 7:00 AM night shift end
        let lastMarkedShiftDate = null;
        setInterval(async () => {
          try {
            const now = new Date();
            // Club night shift concludes at 7:00 AM
            if (now.getHours() >= 7) {
              const yesterday = new Date(now);
              yesterday.setDate(yesterday.getDate() - 1);
              const yesterdayStr = yesterday.toISOString().split("T")[0];

              if (lastMarkedShiftDate !== yesterdayStr) {
                console.log(`⏰ Running 7:00 AM Daily Night-Shift Auto-Marker for shift date ${yesterdayStr}...`);
                const markResult = await autoMarkDailyAbsentees(yesterdayStr);
                lastMarkedShiftDate = yesterdayStr;
                console.log(`✅ 7:00 AM Night-Shift Auto-Marker: ${markResult.message}`);
              }
            }
          } catch (intervalErr) {
            console.error("Periodic absentee auto-marker warning:", intervalErr.message);
          }
        }, 15 * 60 * 1000);

        console.log("⏰ Daily 7:00 AM Night-Shift Absentee Auto-Marker initialized");
      } catch (attSchedErr) {
        console.error("Failed to start attendance auto-marker scheduler:", attSchedErr);
      }
    });
  } catch (error) {
    console.error("❌ Failed to start RBMS backend");
    console.error(error);

    process.exit(1);
  }
};

startServer();
