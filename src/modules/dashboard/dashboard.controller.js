const dashboardService = require("./dashboard.service");


// ============================================================
// DASHBOARD
// ============================================================

const getDashboard = async (req, res) => {
  try {

    const stats =
      await dashboardService.getDashboardSummary();

    res.json({
      success: true,
      stats,
    });

  } catch (error) {

    console.error("Dashboard error:", error);

    res.status(500).json({
      success: false,
      message: "Failed to fetch dashboard data",
    });

  }
};


// ============================================================
// TODAY'S SALES
// ============================================================

const getTodaySales = async (req, res) => {
  try {

    const sales =
      await dashboardService.getTodaySales();

    res.json({
      success: true,
      sales,
    });

  } catch (error) {

    console.error("Today sales error:", error);

    res.status(500).json({
      success: false,
      message: "Failed to fetch today's sales",
    });

  }
};


// ============================================================
// RECENT ORDERS
// ============================================================

const getRecentOrders = async (req, res) => {
  try {

    const orders =
      await dashboardService.getRecentOrders();

    res.json({
      success: true,
      count: orders.length,
      orders,
    });

  } catch (error) {

    console.error("Recent orders error:", error);

    res.status(500).json({
      success: false,
      message: "Failed to fetch recent orders",
    });

  }
};


// ============================================================
// SALES CHART
// ============================================================

const getSalesChart = async (req, res) => {
  try {

    const sales =
      await dashboardService.getSalesChart();

    res.json({
      success: true,
      sales,
    });

  } catch (error) {

    console.error("Sales chart error:", error);

    res.status(500).json({
      success: false,
      message: "Failed to fetch sales chart",
    });

  }
};


// ============================================================
// TOP PRODUCTS
// ============================================================

const getTopProducts = async (req, res) => {
  try {

    const products =
      await dashboardService.getTopProducts();

    res.json({
      success: true,
      products,
    });

  } catch (error) {

    console.error("Top products error:", error);

    res.status(500).json({
      success: false,
      message: "Failed to fetch top products",
    });

  }
};


// ============================================================
// TODAY'S DEPARTMENT SALES (ITEMIZED BAR VS KITCHEN)
// ============================================================

const getTodayDepartmentSales = async (req, res) => {
  try {
    const { date } = req.query;
    const data = await dashboardService.getTodayDepartmentSales(date);

    res.json({
      success: true,
      ...data,
    });
  } catch (error) {
    console.error("Today department sales error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch today's department sales",
    });
  }
};


module.exports = {
  getDashboard,
  getTodaySales,
  getRecentOrders,
  getSalesChart,
  getTopProducts,
  getTodayDepartmentSales,
};