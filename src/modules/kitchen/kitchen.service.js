const pool = require("../../config/database");


// ============================================================
// GET ALL KITCHEN ORDERS
// ============================================================

const getAllKitchenOrders = async () => {
  const result = await pool.query(`
    SELECT
      ko.id,
      ko.order_id,
      ko.status,
      ko.started_at,
      ko.ready_at,
      ko.chef_id,
      ko.notes,
      ko.created_at,

      o.order_number,
o.table_id,
o.order_type,
o.payment_status,

      rt.table_number,

      e.first_name AS chef_first_name,
      e.last_name AS chef_last_name

    FROM kitchen_orders ko

    JOIN orders o
      ON ko.order_id = o.id

    LEFT JOIN restaurant_tables rt
      ON o.table_id = rt.id

    LEFT JOIN employees e
      ON ko.chef_id = e.id

    ORDER BY ko.created_at DESC
  `);

  const orders = result.rows;

  // Get items for every kitchen order
  for (const order of orders) {
    const itemsResult = await pool.query(
      `
      SELECT
        koi.id,
        koi.quantity,
        koi.status,

        oi.id AS order_item_id,
        oi.product_id,
        oi.unit_price,
        oi.notes AS item_notes,

        p.name AS product_name

      FROM kitchen_order_items koi

      JOIN order_items oi
        ON koi.order_item_id = oi.id

      JOIN products p
        ON oi.product_id = p.id

      WHERE koi.kitchen_order_id = $1

      ORDER BY koi.id ASC
      `,
      [order.id]
    );

    order.items = itemsResult.rows;
  }

  return orders;
};


// ============================================================
// GET KITCHEN ORDER BY ID
// ============================================================

const getKitchenOrderById = async (id) => {
  const numericId = Number(id);
  if (!Number.isInteger(numericId)) {
    return null;
  }

  const orderResult = await pool.query(
    `
    SELECT
      ko.id,
      ko.order_id,
      ko.status,
      ko.started_at,
      ko.ready_at,
      ko.chef_id,
      ko.notes,
      ko.created_at,

      o.order_number,
  o.table_id,
o.order_type,
o.payment_status,

      rt.table_number

    FROM kitchen_orders ko

    JOIN orders o
      ON ko.order_id = o.id

    LEFT JOIN restaurant_tables rt
      ON o.table_id = rt.id

    WHERE ko.id = $1
    `,
    [numericId]
  );

  if (orderResult.rows.length === 0) {
    return null;
  }

  const order = orderResult.rows[0];

  const itemsResult = await pool.query(
    `
    SELECT
      koi.id,
      koi.quantity,
      koi.status,

      oi.id AS order_item_id,
      oi.product_id,
      oi.unit_price,
      oi.notes AS item_notes,

      p.name AS product_name

    FROM kitchen_order_items koi

    JOIN order_items oi
      ON koi.order_item_id = oi.id

    JOIN products p
      ON oi.product_id = p.id

    WHERE koi.kitchen_order_id = $1

    ORDER BY koi.id ASC
    `,
    [numericId]
  );

  order.items = itemsResult.rows;

  return order;
};


// ============================================================
// CREATE KITCHEN ORDER
// ============================================================

const createKitchenOrder = async (data) => {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const {
      orderId,
      chefId,
      notes,
      items = [],
    } = data;

    // Create kitchen order
    const kitchenOrderResult = await client.query(
      `
      INSERT INTO kitchen_orders (
        order_id,
        chef_id,
        notes,
        status
      )
      VALUES ($1, $2, $3, 'pending')
      RETURNING *
      `,
      [
        orderId,
        chefId || null,
        notes || null,
      ]
    );

    const kitchenOrder = kitchenOrderResult.rows[0];

    // Add kitchen items
    for (const item of items) {
      await client.query(
        `
        INSERT INTO kitchen_order_items (
          kitchen_order_id,
          order_item_id,
          quantity,
          status
        )
        VALUES ($1, $2, $3, 'pending')
        `,
        [
          kitchenOrder.id,
          item.orderItemId,
          item.quantity,
        ]
      );
    }

    await client.query("COMMIT");

    return kitchenOrder;

  } catch (error) {
    await client.query("ROLLBACK");
    throw error;

  } finally {
    client.release();
  }
};


// ============================================================
// UPDATE KITCHEN ORDER STATUS
// ============================================================

const updateKitchenOrderStatus = async (id, status, chefId) => {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    let query = `
      UPDATE kitchen_orders
      SET
        status = $1
    `;

    const values = [status];

    // Preparing
    if (status === "preparing") {
      query += `,
        started_at = CURRENT_TIMESTAMP
      `;
    }

    // Ready
    if (status === "ready") {
      query += `,
        ready_at = CURRENT_TIMESTAMP
      `;
    }

    // Assign chef
    if (chefId) {
      query += `,
        chef_id = $${values.length + 1}
      `;

      values.push(chefId);
    }

    query += `
      WHERE id = $${values.length + 1}
      RETURNING *
    `;

    values.push(id);

    const result = await client.query(query, values);

    if (result.rows.length === 0) {
      await client.query("ROLLBACK");
      return null;
    }

    // Update kitchen items too
    await client.query(
      `
      UPDATE kitchen_order_items
      SET status = $1
      WHERE kitchen_order_id = $2
      `,
      [status, id]
    );

    // Also synchronize main order status
    const kitchenOrder = result.rows[0];

    await client.query(
      `
      UPDATE orders
      SET status = $1,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = $2
      `,
      [status, kitchenOrder.order_id]
    );

    await client.query("COMMIT");

    return result.rows[0];

  } catch (error) {
    await client.query("ROLLBACK");
    throw error;

  } finally {
    client.release();
  }
};


// ============================================================
// DELETE KITCHEN ORDER
// ============================================================

const deleteKitchenOrder = async (id) => {
  const result = await pool.query(
    `
    DELETE FROM kitchen_orders
    WHERE id = $1
    RETURNING *
    `,
    [id]
  );

  return result.rows[0];
};


module.exports = {
  getAllKitchenOrders,
  getKitchenOrderById,
  createKitchenOrder,
  updateKitchenOrderStatus,
  deleteKitchenOrder,
};