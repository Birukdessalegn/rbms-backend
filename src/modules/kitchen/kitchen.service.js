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

// ============================================================
// GET KITCHEN STOCK AUDITS (AUDIT HISTORY)
// ============================================================

const getKitchenAudits = async ({ limit = 50, productId, department } = {}) => {
  let query = `
    SELECT
      ksa.id,
      ksa.product_id,
      ksa.department,
      ksa.action,
      ksa.physical_count_found,
      ksa.verified_by,
      ksa.verifier_name,
      ksa.notes,
      ksa.created_at,

      p.name AS product_name,
      p.product_code,
      p.unit,
      p.image_url,
      pc.name AS category_name,

      COALESCE(di.quantity, 0) AS current_kitchen_stock

    FROM kitchen_stock_audits ksa
    JOIN products p ON ksa.product_id = p.id
    LEFT JOIN product_categories pc ON p.category_id = pc.id
    LEFT JOIN department_inventory di ON di.product_id = p.id AND di.department = ksa.department
    WHERE 1=1
  `;
  const params = [];

  if (productId) {
    params.push(productId);
    query += ` AND ksa.product_id = $${params.length}`;
  }

  if (department) {
    params.push(department.toLowerCase());
    query += ` AND ksa.department = $${params.length}`;
  }

  query += ` ORDER BY ksa.created_at DESC`;

  if (limit) {
    params.push(limit);
    query += ` LIMIT $${params.length}`;
  }

  const result = await pool.query(query, params);
  return result.rows;
};

// ============================================================
// VERIFY KITCHEN STOCK / APPROVE OUT-OF-STOCK
// ============================================================

const verifyKitchenStock = async ({
  productId,
  department = "kitchen",
  action, // 'approved_depleted' | 'rejected_stock_found' | 'verified_in_stock'
  physicalCountFound = 0,
  notes,
  userId,
  verifierName,
}) => {
  if (!productId) {
    throw new Error("Product ID is required for stock verification.");
  }

  if (!action || !["approved_depleted", "rejected_stock_found", "verified_in_stock"].includes(action)) {
    throw new Error("Invalid verification action. Must be 'approved_depleted', 'rejected_stock_found', or 'verified_in_stock'.");
  }

  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    // 1. Get product info
    const prodRes = await client.query(
      `SELECT id, name, unit FROM products WHERE id = $1`,
      [productId]
    );

    if (prodRes.rows.length === 0) {
      throw new Error(`Product #${productId} not found.`);
    }
    const product = prodRes.rows[0];

    // 2. Resolve verifier name if not provided
    let finalVerifierName = verifierName;
    if (!finalVerifierName && userId) {
      const userRes = await client.query(
        `
        SELECT u.username, e.first_name, e.last_name
        FROM users u
        LEFT JOIN employees e ON e.user_id = u.id
        WHERE u.id = $1
        `,
        [userId]
      );
      if (userRes.rows.length > 0) {
        const u = userRes.rows[0];
        finalVerifierName = (u.first_name && u.last_name) ? `${u.first_name} ${u.last_name}` : u.username;
      }
    }

    const countFound = Number(physicalCountFound || 0);

    // 3. Handle stock updates based on action
    if (action === "rejected_stock_found" || action === "verified_in_stock") {
      // The controller found physical stock! Restore it in kitchen sub-store
      await client.query(
        `
        INSERT INTO department_inventory (department, product_id, quantity, unit, updated_at)
        VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP)
        ON CONFLICT (department, product_id)
        DO UPDATE SET quantity = $3, updated_at = CURRENT_TIMESTAMP
        `,
        [department, productId, countFound, product.unit || "pcs"]
      );

      // Record transaction
      await client.query(
        `
        INSERT INTO department_inventory_transactions (
          department,
          product_id,
          transaction_type,
          quantity,
          reference_type,
          notes,
          created_by
        )
        VALUES ($1, $2, 'adjustment_in', $3, 'physical_audit', $4, $5)
        `,
        [
          department,
          productId,
          countFound,
          `F&B Controller found physical stock during kitchen inspection (${notes || "Stock verified in kitchen"})`,
          userId || null,
        ]
      );

      // Ensure product is marked available
      if (countFound > 0) {
        await client.query(
          `UPDATE products SET is_available = TRUE WHERE id = $1`,
          [productId]
        );
      }
    } else if (action === "approved_depleted") {
      // Confirmed genuinely depleted / finished
      await client.query(
        `
        INSERT INTO department_inventory (department, product_id, quantity, unit, updated_at)
        VALUES ($1, $2, 0, $3, CURRENT_TIMESTAMP)
        ON CONFLICT (department, product_id)
        DO UPDATE SET quantity = 0, updated_at = CURRENT_TIMESTAMP
        `,
        [department, productId, product.unit || "pcs"]
      );

      await client.query(
        `
        INSERT INTO department_inventory_transactions (
          department,
          product_id,
          transaction_type,
          quantity,
          reference_type,
          notes,
          created_by
        )
        VALUES ($1, $2, 'depleted_verified', 0, 'physical_audit', $3, $4)
        `,
        [
          department,
          productId,
          `F&B Controller physically verified item is completely depleted in kitchen (${notes || "Confirmed finished"})`,
          userId || null,
        ]
      );
    }

    // 4. Record audit entry
    const auditRes = await client.query(
      `
      INSERT INTO kitchen_stock_audits (
        product_id,
        department,
        action,
        physical_count_found,
        verified_by,
        verifier_name,
        notes
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING *
      `,
      [
        productId,
        department,
        action,
        countFound,
        userId || null,
        finalVerifierName || "F&B Controller",
        notes || null,
      ]
    );

    await client.query("COMMIT");
    return auditRes.rows[0];

  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
};

module.exports = {
  getAllKitchenOrders,
  getKitchenOrderById,
  createKitchenOrder,
  updateKitchenOrderStatus,
  deleteKitchenOrder,
  getKitchenAudits,
  verifyKitchenStock,
};