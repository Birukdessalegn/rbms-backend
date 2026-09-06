const pool = require("../../config/database");

// ============================================================
// GET ALL BAR ORDERS
// ============================================================

// ============================================================
// GET ALL BAR ORDERS (WITH DRINK ITEMS ATTACHED)
// ============================================================

const getAllBarOrders = async () => {
  const result = await pool.query(`
    SELECT
      bo.id,
      bo.order_id,
      bo.bartender_id,
      bo.status,
      bo.started_at,
      bo.ready_at,
      bo.notes,
      bo.created_at,

      o.order_number,
      o.table_id,
      o.is_bar_order,
      o.waiter_id,
      rt.table_number,
      rt.is_bar_seat,
      rt.type AS table_type,
      rt.section AS table_section,

      ew.first_name AS waiter_first_name,
      ew.last_name AS waiter_last_name,
      COALESCE(ew.first_name || ' ' || ew.last_name, uw.username) AS waiter_name,

      e.first_name AS bartender_first_name,
      e.last_name AS bartender_last_name,
      COALESCE(e.first_name || ' ' || e.last_name, u.username) AS bartender_name,

      COALESCE(
        (
          SELECT JSON_AGG(
            JSON_BUILD_OBJECT(
              'id', boi.id,
              'order_item_id', boi.order_item_id,
              'quantity', boi.quantity,
              'status', boi.status,
              'product_id', oi.product_id,
              'product_name', p.name,
              'name', p.name,
              'unit_price', oi.unit_price,
              'notes', oi.notes
            )
          )
          FROM bar_order_items boi
          JOIN order_items oi ON boi.order_item_id = oi.id
          JOIN products p ON oi.product_id = p.id
          WHERE boi.bar_order_id = bo.id
        ),
        '[]'::json
      ) AS items

    FROM bar_orders bo

    JOIN orders o
      ON bo.order_id = o.id

    LEFT JOIN restaurant_tables rt
      ON o.table_id = rt.id

    LEFT JOIN employees ew
      ON o.waiter_id = ew.id

    LEFT JOIN users uw
      ON ew.user_id = uw.id

    LEFT JOIN employees e
      ON COALESCE(bo.bartender_id, o.bartender_id) = e.id

    LEFT JOIN users u
      ON e.user_id = u.id

    ORDER BY bo.created_at DESC
  `);

  return result.rows;
};



// ============================================================
// GET BAR ORDER BY ID
// ============================================================

const getBarOrderById = async (id) => {
  const orderResult = await pool.query(
    `
    SELECT
      bo.id,
      bo.order_id,
      bo.bartender_id,
      bo.status,
      bo.started_at,
      bo.ready_at,
      bo.notes,
      bo.created_at,

      o.order_number,
      o.table_id,
      o.is_bar_order,
      o.waiter_id,
      rt.table_number,
      rt.is_bar_seat,
      rt.type AS table_type,
      rt.section AS table_section,

      ew.first_name AS waiter_first_name,
      ew.last_name AS waiter_last_name,
      COALESCE(ew.first_name || ' ' || ew.last_name, uw.username) AS waiter_name,

      e.first_name AS bartender_first_name,
      e.last_name AS bartender_last_name,
      COALESCE(e.first_name || ' ' || e.last_name, u.username) AS bartender_name

    FROM bar_orders bo

    JOIN orders o
      ON bo.order_id = o.id

    LEFT JOIN restaurant_tables rt
      ON o.table_id = rt.id

    LEFT JOIN employees ew
      ON o.waiter_id = ew.id

    LEFT JOIN users uw
      ON ew.user_id = uw.id

    LEFT JOIN employees e
      ON COALESCE(bo.bartender_id, o.bartender_id) = e.id

    LEFT JOIN users u
      ON e.user_id = u.id

    WHERE bo.id = $1
    `,
    [id]
  );

  if (orderResult.rows.length === 0) {
    return null;
  }

  const barOrder = orderResult.rows[0];

  // Get bar items
  const itemsResult = await pool.query(
    `
    SELECT
      boi.id,
      boi.order_item_id,
      boi.quantity,
      boi.status,

      oi.product_id,
      oi.unit_price,
      oi.total,
      oi.notes,

      p.name AS product_name,
      p.unit

    FROM bar_order_items boi

    JOIN order_items oi
      ON boi.order_item_id = oi.id

    JOIN products p
      ON oi.product_id = p.id

    WHERE boi.bar_order_id = $1

    ORDER BY boi.id ASC
    `,
    [id]
  );

  barOrder.items = itemsResult.rows;

  return barOrder;
};


// ============================================================
// UPDATE BAR ORDER STATUS
// ============================================================

// ============================================================
// UPDATE BAR ORDER STATUS
// ============================================================

// ============================================================
// UPDATE BAR ORDER STATUS
// ============================================================

const updateBarOrderStatus = async (id, status, bartenderId) => {
  const allowedStatuses = [
    "pending",
    "confirmed",
    "preparing",
    "ready",
    "served",
    "completed",
    "cancelled",
  ];

  if (!allowedStatuses.includes(status)) {
    throw new Error("Invalid bar order status");
  }

  const result = await pool.query(
    `
    UPDATE bar_orders
    SET
      status = $1::order_status,

      bartender_id = COALESCE($2, bartender_id),

      started_at =
        CASE
          WHEN $1::order_status = 'preparing'::order_status
               AND started_at IS NULL
          THEN CURRENT_TIMESTAMP
          ELSE started_at
        END,

      ready_at =
        CASE
          WHEN $1::order_status = 'ready'::order_status
          THEN CURRENT_TIMESTAMP
          ELSE ready_at
        END

    WHERE id = $3

    RETURNING *
    `,
    [
      status,
      bartenderId || null,
      id,
    ]
  );

  return result.rows[0];
};


// ============================================================
// GET BAR ORDERS BY STATUS
// ============================================================

const getBarOrdersByStatus = async (status) => {
  const result = await pool.query(
    `
    SELECT
      bo.id,
      bo.order_id,
      bo.bartender_id,
      bo.status,
      bo.started_at,
      bo.ready_at,
      bo.notes,
      bo.created_at,

      o.order_number,
      o.table_id,
      o.is_bar_order,
      o.waiter_id,
      rt.table_number,
      rt.is_bar_seat,
      rt.type AS table_type,
      rt.section AS table_section,

      ew.first_name AS waiter_first_name,
      ew.last_name AS waiter_last_name,
      COALESCE(ew.first_name || ' ' || ew.last_name, uw.username) AS waiter_name,

      e.first_name AS bartender_first_name,
      e.last_name AS bartender_last_name,
      COALESCE(e.first_name || ' ' || e.last_name, u.username) AS bartender_name

    FROM bar_orders bo

    JOIN orders o
      ON bo.order_id = o.id

    LEFT JOIN restaurant_tables rt
      ON o.table_id = rt.id

    LEFT JOIN employees ew
      ON o.waiter_id = ew.id

    LEFT JOIN users uw
      ON ew.user_id = uw.id

    LEFT JOIN employees e
      ON COALESCE(bo.bartender_id, o.bartender_id) = e.id

    LEFT JOIN users u
      ON e.user_id = u.id

    WHERE bo.status = $1

    ORDER BY bo.created_at ASC
    `,
    [status]
  );

  return result.rows;
};


module.exports = {
  getAllBarOrders,
  getBarOrderById,
  updateBarOrderStatus,
  getBarOrdersByStatus,
};