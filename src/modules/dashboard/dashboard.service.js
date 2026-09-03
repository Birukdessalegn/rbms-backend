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

      -- Bar low stock products
      (
        SELECT COUNT(*)
        FROM department_inventory
        WHERE department = 'bar' AND quantity <= minimum_stock
      ) AS bar_low_stock_products,

      -- Kitchen low stock products
      (
        SELECT COUNT(*)
        FROM department_inventory
        WHERE department = 'kitchen' AND quantity <= minimum_stock
      ) AS kitchen_low_stock_products,

      -- Today's items sold total
      (
        SELECT COALESCE(SUM(oi.quantity), 0)
        FROM order_items oi
        JOIN orders o ON oi.order_id = o.id
        WHERE o.status != 'cancelled' AND o.created_at::date = CURRENT_DATE
      ) AS today_items_sold,

      -- Today's bar items sold
      (
        SELECT COALESCE(SUM(oi.quantity), 0)
        FROM order_items oi
        JOIN orders o ON oi.order_id = o.id
        JOIN products p ON oi.product_id = p.id
        LEFT JOIN product_categories pc ON p.category_id = pc.id
        WHERE o.status != 'cancelled'
          AND o.created_at::date = CURRENT_DATE
          AND LOWER(pc.type) IN ('beverage', 'bar')
      ) AS today_bar_items_sold,

      -- Today's kitchen items sold
      (
        SELECT COALESCE(SUM(oi.quantity), 0)
        FROM order_items oi
        JOIN orders o ON oi.order_id = o.id
        JOIN products p ON oi.product_id = p.id
        LEFT JOIN product_categories pc ON p.category_id = pc.id
        WHERE o.status != 'cancelled'
          AND o.created_at::date = CURRENT_DATE
          AND LOWER(pc.type) = 'food'
      ) AS today_kitchen_items_sold,

      -- Pending transfers / requisitions
      (
        SELECT COUNT(*)
        FROM stock_transfers
        WHERE status = 'pending'
      ) AS pending_transfers,

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
// TOP PRODUCTS & ITEMIZED REVENUE BREAKDOWN
// ============================================================

const getTopProducts = async (limit = 10) => {
  const result = await pool.query(
    `
    SELECT
      p.id,
      p.product_code,
      p.name,
      p.price,
      p.unit,
      p.image_url,
      pc.name AS category_name,
      pc.type AS category_type,
      COALESCE(SUM(oi.quantity), 0)::INTEGER AS quantity_sold,
      COALESCE(SUM(oi.total_price), SUM(oi.subtotal), SUM(oi.unit_price * oi.quantity), 0)::NUMERIC(12,2) AS revenue

    FROM order_items oi

    JOIN products p
      ON oi.product_id = p.id

    LEFT JOIN product_categories pc
      ON p.category_id = pc.id

    JOIN orders o
      ON oi.order_id = o.id

    WHERE o.status != 'cancelled'

    GROUP BY p.id, p.product_code, p.name, p.price, p.unit, p.image_url, pc.name, pc.type

    ORDER BY revenue DESC

    LIMIT $1
  `,
    [limit]
  );

  return result.rows;
};


// ============================================================
// TODAY'S ITEMIZED SALES BY DEPARTMENT & ON-HAND STOCK
// ============================================================

const getTodayDepartmentSales = async (date = null) => {
  const dateClause = date ? `o.created_at::date = $1` : `o.created_at::date = CURRENT_DATE`;
  const params = date ? [date] : [];

  const itemsResult = await pool.query(
    `
    SELECT
      p.id AS product_id,
      p.product_code,
      p.name AS product_name,
      p.unit,
      p.price,
      pc.name AS category_name,
      CASE
        WHEN LOWER(pc.type) = 'food' THEN 'kitchen'
        WHEN LOWER(pc.type) IN ('beverage', 'bar') THEN 'bar'
        ELSE 'other'
      END AS department,
      COALESCE(SUM(oi.quantity), 0)::NUMERIC(12,2) AS quantity_sold,
      COALESCE(SUM(oi.total), SUM(oi.unit_price * oi.quantity), 0)::NUMERIC(12,2) AS total_revenue,
      
      -- Remaining stock in Central Store
      COALESCE(i.quantity, 0)::NUMERIC(12,2) AS remaining_main_stock,
      
      -- Remaining stock in Department Outlet Sub-Store
      COALESCE(dept_inv.quantity, 0)::NUMERIC(12,2) AS remaining_outlet_stock

    FROM order_items oi

    JOIN orders o ON oi.order_id = o.id

    JOIN products p ON oi.product_id = p.id

    LEFT JOIN product_categories pc ON p.category_id = pc.id

    LEFT JOIN inventory i ON p.id = i.product_id

    LEFT JOIN department_inventory dept_inv ON p.id = dept_inv.product_id
      AND dept_inv.department = (
        CASE
          WHEN LOWER(pc.type) = 'food' THEN 'kitchen'
          WHEN LOWER(pc.type) IN ('beverage', 'bar') THEN 'bar'
          ELSE 'other'
        END
      )

    WHERE o.status != 'cancelled' AND ${dateClause}

    GROUP BY p.id, p.product_code, p.name, p.unit, p.price, pc.name, pc.type, i.quantity, dept_inv.quantity

    ORDER BY quantity_sold DESC
    `,
    params
  );

  let totalItemsSold = 0;
  let barItemsSold = 0;
  let kitchenItemsSold = 0;
  let totalRevenue = 0;

  for (const item of itemsResult.rows) {
    const qty = Number(item.quantity_sold);
    const rev = Number(item.total_revenue);
    totalItemsSold += qty;
    totalRevenue += rev;
    if (item.department === "bar") barItemsSold += qty;
    if (item.department === "kitchen") kitchenItemsSold += qty;
  }

  return {
    summary: {
      total_items_sold: totalItemsSold,
      bar_items_sold: barItemsSold,
      kitchen_items_sold: kitchenItemsSold,
      total_revenue: Number(totalRevenue.toFixed(2)),
    },
    items: itemsResult.rows,
  };
};


module.exports = {
  getDashboardSummary,
  getTodaySales,
  getRecentOrders,
  getSalesChart,
  getTopProducts,
  getTodayDepartmentSales,
};
