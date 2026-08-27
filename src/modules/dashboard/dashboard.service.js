const pool = require("../../config/database");

// ============================================================
// DASHBOARD SUMMARY
// ============================================================

const getDashboardSummary = async () => {
  const result = await pool.query(`
    SELECT

      -- Today's sales
      (
        SELECT COALESCE(SUM(amount), 0)
        FROM payments
        WHERE status = 'paid'
          AND paid_at::date = CURRENT_DATE
      ) AS today_sales,

      -- Today's orders
      (
        SELECT COUNT(*)
        FROM orders
        WHERE created_at::date = CURRENT_DATE
      ) AS today_orders,

      -- Total orders
      (
        SELECT COUNT(*)
        FROM orders
      ) AS total_orders,

      -- Total products
      (
        SELECT COUNT(*)
        FROM products
        WHERE is_active = TRUE
      ) AS total_products,

      -- Available products
      (
        SELECT COUNT(*)
        FROM products
        WHERE is_active = TRUE
          AND is_available = TRUE
      ) AS available_products,

      -- Low stock products
      (
        SELECT COUNT(*)
        FROM inventory
        WHERE quantity <= minimum_stock
      ) AS low_stock_products,

      -- Pending kitchen orders
      (
        SELECT COUNT(*)
        FROM kitchen_orders
        WHERE status IN ('pending', 'confirmed', 'preparing')
      ) AS pending_kitchen_orders,

      -- Pending bar orders
      (
        SELECT COUNT(*)
        FROM bar_orders
        WHERE status IN ('pending', 'confirmed', 'preparing')
      ) AS pending_bar_orders,

      -- Pending purchases
      (
        SELECT COUNT(*)
        FROM purchase_orders
        WHERE status IN ('draft', 'ordered', 'partially_received')
      ) AS pending_purchases,

      -- Pending expenses
      (
        SELECT COUNT(*)
        FROM expenses
        WHERE status = 'pending'
      ) AS pending_expenses,

      -- Active employees
      (
        SELECT COUNT(*)
        FROM employees
        WHERE status = 'active'
      ) AS active_employees,

      -- Today's expenses
      (
        SELECT COALESCE(SUM(amount), 0)
        FROM expenses
        WHERE expense_date = CURRENT_DATE
          AND status = 'paid'
      ) AS today_expenses

  `);

  return result.rows[0];
};


// ============================================================
// TODAY'S SALES
// ============================================================

const getTodaySales = async () => {
  const result = await pool.query(`
    SELECT
      COALESCE(SUM(amount), 0) AS total_sales,
      COUNT(*) AS payment_count
    FROM payments
    WHERE status = 'paid'
      AND paid_at::date = CURRENT_DATE
  `);

  return result.rows[0];
};


// ============================================================
// RECENT ORDERS
// ============================================================

const getRecentOrders = async () => {
  const result = await pool.query(`
    SELECT
      o.id,
      o.order_number,
      o.order_type,
      o.total,
      o.status,
      o.payment_status,
      o.created_at,
      rt.table_number

    FROM orders o

    LEFT JOIN restaurant_tables rt
      ON o.table_id = rt.id

    ORDER BY o.created_at DESC

    LIMIT 10
  `);

  return result.rows;
};


// ============================================================
// SALES BY DAY
// ============================================================

const getSalesChart = async () => {
  const result = await pool.query(`
    SELECT
      DATE(paid_at) AS date,
      COALESCE(SUM(amount), 0) AS sales
    FROM payments
    WHERE status = 'paid'
      AND paid_at >= CURRENT_DATE - INTERVAL '6 days'
    GROUP BY DATE(paid_at)
    ORDER BY DATE(paid_at) ASC
  `);

  return result.rows;
};


// ============================================================
// TOP PRODUCTS
// ============================================================

const getTopProducts = async () => {
  const result = await pool.query(`
    SELECT
      p.id,
      p.name,
      SUM(oi.quantity) AS quantity_sold,
      SUM(oi.total) AS revenue

    FROM order_items oi

    JOIN products p
      ON oi.product_id = p.id

    JOIN orders o
      ON oi.order_id = o.id

    WHERE o.status != 'cancelled'

    GROUP BY p.id, p.name

    ORDER BY quantity_sold DESC

    LIMIT 5
  `);

  return result.rows;
};


module.exports = {
  getDashboardSummary,
  getTodaySales,
  getRecentOrders,
  getSalesChart,
  getTopProducts,
};