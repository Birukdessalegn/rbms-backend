const express = require("express");
const cors = require("cors");
const authRoutes = require("./modules/auth/auth.routes");
const employeesRoutes = require("./modules/employees/employees.routes");
const attendanceRoutes = require("./modules/attendance/attendance.routes");
const productsRoutes = require("./modules/products/products.routes");
const inventoryRoutes = require("./modules/inventory/inventory.routes");
const purchasingRoutes =   require("./modules/purchasing/purchasing.routes");
const kitchenRoutes = require("./modules/kitchen/kitchen.routes");
const posRoutes = require("./modules/pos/pos.routes"); 
const barRoutes = require("./modules/bar/bar.routes");
const expensesRoutes = require("./modules/expenses/expenses.routes");
const dashboardRoutes = require("./modules/dashboard/dashboard.routes");
const paymentsRoutes = require("./modules/payments/payments.routes");

const financeRoutes = require("./modules/finance/finance.routes");




const leaveRoutes = require("./modules/leave/leave.routes");
const tableRoutes = require("./modules/tables/table.routes");

const app = express();


// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));


// Routes
app.use("/api/auth", authRoutes);
app.use("/api/leave", leaveRoutes);
app.use("/api/employees", employeesRoutes);
app.use("/api/attendance", attendanceRoutes);
app.use("/api/products", productsRoutes);
app.use("/api/inventory", inventoryRoutes);
app.use( "/api/purchasing",purchasingRoutes);
app.use("/api/kitchen", kitchenRoutes);
app.use("/api/pos", posRoutes);
app.use("/api/bar", barRoutes);
app.use("/api/expenses", expensesRoutes);
app.use("/api/dashboard", dashboardRoutes);
app.use("/api/payments", paymentsRoutes);
app.use("/api/tables", tableRoutes);
app.use("/api/finance", financeRoutes);

// Test route
app.get("/", (req, res) => {
  res.json({
    success: true,
    message: "RBMS Backend is running 🚀",
  });
});


module.exports = app;