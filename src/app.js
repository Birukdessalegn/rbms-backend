const express = require("express");
const cors = require("cors");
const path = require("path");

// Routes
const authRoutes = require("./modules/auth/auth.routes");
const employeesRoutes = require("./modules/employees/employees.routes");
const attendanceRoutes = require("./modules/attendance/attendance.routes");
const productsRoutes = require("./modules/products/products.routes");
const inventoryRoutes = require("./modules/inventory/inventory.routes");
const purchasingRoutes = require("./modules/purchasing/purchasing.routes");
const kitchenRoutes = require("./modules/kitchen/kitchen.routes");
const posRoutes = require("./modules/pos/pos.routes"); 
const barRoutes = require("./modules/bar/bar.routes");
const expensesRoutes = require("./modules/expenses/expenses.routes");
const dashboardRoutes = require("./modules/dashboard/dashboard.routes");
const paymentsRoutes = require("./modules/payments/payments.routes");
const financeRoutes = require("./modules/finance/finance.routes");
const leaveRoutes = require("./modules/leave/leave.routes");
const tableRoutes = require("./modules/tables/table.routes");
const vipCustomersRoutes = require("./modules/customers/vip_customers.routes");
const notificationsRoutes = require("./modules/notifications/notifications.routes");

const app = express();

// CORS configuration
const allowedOrigins = [
  "https://theoak.ambbatech.com",
  "http://theoak.ambbatech.com",
  "http://localhost:5173",
  "http://localhost:3000"
];

const corsOptions = {
  origin: (origin, callback) => {
    // Allow requests with no origin (curl, mobile apps, server-to-server)
    if (!origin || allowedOrigins.includes(origin)) {
      return callback(null, true);
    }
    return callback(null, false);
  },
  credentials: true,
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With", "Accept"],
  optionsSuccessStatus: 200
};

// Apply CORS middleware (handles regular & preflight requests)
app.use(cors(corsOptions));

// Body Parsers & Static Files
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ limit: "10mb", extended: true }));
app.use("/uploads", express.static(path.join(__dirname, "../uploads")));

// Routes
app.use("/api/auth", authRoutes);
app.use("/api/leave", leaveRoutes);
app.use("/api/employees", employeesRoutes);
app.use("/api/attendance", attendanceRoutes);
app.use("/api/products", productsRoutes);
app.use("/api/inventory", inventoryRoutes);
app.use("/api/purchasing", purchasingRoutes);
app.use("/api/kitchen", kitchenRoutes);
app.use("/api/pos", posRoutes);
app.use("/api/bar", barRoutes);
app.use("/api/expenses", expensesRoutes);
app.use("/api/dashboard", dashboardRoutes);
app.use("/api/payments", paymentsRoutes);
app.use("/api/tables", tableRoutes);
app.use("/api/finance", financeRoutes);
app.use("/api/vip-customers", vipCustomersRoutes);
app.use("/api/notifications", notificationsRoutes);

// Database pool for health check and diagnostics
const pool = require("./config/database");

// Test route
app.get("/", (req, res) => {
  res.json({
    success: true,
    message: "RBMS Backend is running 🚀",
  });
});

// Diagnostic & migration check route
app.get("/api/db-diagnostics", async (req, res) => {
  try {
    const userRes = await pool.query("SELECT current_user, current_database()");
    const ownerRes = await pool.query(
      "SELECT tablename, tableowner FROM pg_tables WHERE schemaname = 'public' AND tablename = 'products'"
    );

    let alterResult = "Not attempted";
    try {
      await pool.query("ALTER TABLE products ADD COLUMN IF NOT EXISTS applicable_for VARCHAR(50) DEFAULT 'both';");
      alterResult = "SUCCESS: Column added or verified!";
    } catch (e) {
      alterResult = "FAILED: " + e.message;
    }

    const colsRes = await pool.query(
      "SELECT column_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'products'"
    );

    res.json({
      connected_user: userRes.rows[0]?.current_user,
      connected_database: userRes.rows[0]?.current_database,
      products_owner: ownerRes.rows[0]?.tableowner,
      alter_result: alterResult,
      has_applicable_for: colsRes.rows.some((c) => c.column_name === "applicable_for"),
      columns_count: colsRes.rows.length,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// One-time route to fix table ownership and add column using rbms-user credentials
app.get("/api/run-owner-fix", async (req, res) => {
  const { Client } = require("pg");
  const password = req.query.password || process.env.DB_PASSWORD;

  const client = new Client({
    host: process.env.DB_HOST || "localhost",
    port: process.env.DB_PORT || 5432,
    database: process.env.DB_NAME || "rbms",
    user: "rbms-user",
    password: password,
  });

  try {
    await client.connect();
    await client.query("ALTER TABLE products ADD COLUMN IF NOT EXISTS applicable_for VARCHAR(50) DEFAULT 'both';");
    await client.query('REASSIGN OWNED BY "rbms-user" TO ambbatxv;');
    await client.query("GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO ambbatxv;");
    await client.query("GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO ambbatxv;");
    await client.end();
    res.json({
      success: true,
      message: "✅ SUCCESS: Column added AND ownership transferred to ambbatxv!",
    });
  } catch (err) {
    try {
      await client.end();
    } catch (_) {}
    res.status(500).json({
      success: false,
      error: err.message,
      hint: "Make sure you pass the rbms-user password in the query string: ?password=your_password",
    });
  }
});

module.exports = app;