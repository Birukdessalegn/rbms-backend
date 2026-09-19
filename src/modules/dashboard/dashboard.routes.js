const express = require("express");

const router = express.Router();

const dashboardController = require("./dashboard.controller");
const authenticate = require("../../middleware/auth.middleware");

// Require authentication for all dashboard routes
router.use(authenticate);


// Main dashboard
router.get(
    "/",
    dashboardController.getDashboard
);


// Today's sales
router.get(
    "/sales/today",
    dashboardController.getTodaySales
);


// Recent orders
router.get(
    "/orders/recent",
    dashboardController.getRecentOrders
);


// Sales chart
router.get(
    "/sales/chart",
    dashboardController.getSalesChart
);


// Top products
router.get(
    "/products/top",
    dashboardController.getTopProducts
);


// Today's department sales (itemized Bar vs Kitchen)
router.get(
    "/today-department-sales",
    dashboardController.getTodayDepartmentSales
);


module.exports = router;