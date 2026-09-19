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
const payrollRoutes = require("./modules/payroll/payroll.routes");
const paymentAccountsRoutes = require("./modules/payment_accounts/payment_accounts.routes");

const app = express();

// CORS configuration - strictly HTTPS in production
const defaultOrigins = ["https://theoak.ambbatech.com"];

const allowedOrigins = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(",").map((o) => o.trim())
  : defaultOrigins;

// Only permit localhost ports during local development
if (process.env.NODE_ENV !== "production") {
  if (!allowedOrigins.includes("http://localhost:5173")) allowedOrigins.push("http://localhost:5173");
  if (!allowedOrigins.includes("http://localhost:3000")) allowedOrigins.push("http://localhost:3000");
}

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

// Security Headers Middleware (OWASP recommended, native Express)
app.use((req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("X-XSS-Protection", "1; mode=block");
  res.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.removeHeader("X-Powered-By");
  next();
});

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
app.use("/api/payroll", payrollRoutes);
app.use("/api/payment-accounts", paymentAccountsRoutes);

// Test route
app.get("/", (req, res) => {
  res.json({
    success: true,
    message: "RBMS Backend is running 🚀",
  });
});

module.exports = app;