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

app.use(cors(corsOptions));
app.options("*", cors(corsOptions));

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

// Test route
app.get("/", (req, res) => {
  res.json({
    success: true,
    message: "RBMS Backend is running 🚀",
  });
});

module.exports = app;