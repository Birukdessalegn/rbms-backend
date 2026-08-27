const pool = require("../../config/database");

// ============================================================
// GET ALL INVENTORY
// ============================================================

const getAllInventory = async () => {
  const result = await pool.query(`
    SELECT
      i.id,
      i.product_id,
      i.quantity,
      i.minimum_stock,
      i.maximum_stock,
      i.unit,
      i.updated_at,

      p.product_code,
      p.name AS product_name,
      p.price,
      p.cost_price,
      p.is_available,
      p.is_active,

      pc.name AS category_name,

      CASE
        WHEN i.quantity <= 0 THEN 'out_of_stock'
        WHEN i.minimum_stock IS NOT NULL
             AND i.quantity <= i.minimum_stock THEN 'low_stock'
        WHEN i.maximum_stock IS NOT NULL
             AND i.quantity >= i.maximum_stock THEN 'overstocked'
        ELSE 'in_stock'
      END AS stock_status

    FROM inventory i

    INNER JOIN products p
      ON i.product_id = p.id

    LEFT JOIN product_categories pc
      ON p.category_id = pc.id

    ORDER BY p.name ASC
  `);

  return result.rows;
};


// ============================================================
// GET INVENTORY BY PRODUCT
// ============================================================

const getInventoryByProduct = async (productId) => {
  const result = await pool.query(
    `
    SELECT
      i.id,
      i.product_id,
      i.quantity,
      i.minimum_stock,
      i.maximum_stock,
      i.unit,
      i.updated_at,

      p.product_code,
      p.name AS product_name,
      p.price,
      p.cost_price,

      CASE
        WHEN i.quantity <= 0 THEN 'out_of_stock'
        WHEN i.minimum_stock IS NOT NULL
             AND i.quantity <= i.minimum_stock THEN 'low_stock'
        WHEN i.maximum_stock IS NOT NULL
             AND i.quantity >= i.maximum_stock THEN 'overstocked'
        ELSE 'in_stock'
      END AS stock_status

    FROM inventory i

    INNER JOIN products p
      ON i.product_id = p.id

    WHERE i.product_id = $1
    `,
    [productId]
  );

  return result.rows[0];
};


// ============================================================
// CREATE INVENTORY RECORD
// ============================================================

const createInventory = async (data) => {
  const {
    productId,
    quantity,
    minimumStock,
    maximumStock,
    unit,
  } = data;

  const result = await pool.query(
    `
    INSERT INTO inventory (
      product_id,
      quantity,
      minimum_stock,
      maximum_stock,
      unit
    )
    VALUES ($1, $2, $3, $4, $5)
    RETURNING *
    `,
    [
      productId,
      quantity || 0,
      minimumStock || 0,
      maximumStock || null,
      unit || "pcs",
    ]
  );

  return result.rows[0];
};


// ============================================================
// UPDATE INVENTORY SETTINGS
// ============================================================

const updateInventory = async (productId, data) => {
  const {
    minimumStock,
    maximumStock,
    unit,
  } = data;

  const result = await pool.query(
    `
    UPDATE inventory
    SET
      minimum_stock = COALESCE($1, minimum_stock),
      maximum_stock = COALESCE($2, maximum_stock),
      unit = COALESCE($3, unit),
      updated_at = CURRENT_TIMESTAMP
    WHERE product_id = $4
    RETURNING *
    `,
    [
      minimumStock,
      maximumStock,
      unit,
      productId,
    ]
  );

  return result.rows[0];
};


// ============================================================
// STOCK IN
// ============================================================

const stockIn = async (productId, quantity, notes, userId) => {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    // Make sure inventory exists
    const inventoryResult = await client.query(
      `
      SELECT *
      FROM inventory
      WHERE product_id = $1
      FOR UPDATE
      `,
      [productId]
    );

    if (inventoryResult.rows.length === 0) {
      throw new Error("Inventory record not found");
    }

    // Increase stock
    const updatedInventory = await client.query(
      `
      UPDATE inventory
      SET
        quantity = quantity + $1,
        updated_at = CURRENT_TIMESTAMP
      WHERE product_id = $2
      RETURNING *
      `,
      [quantity, productId]
    );

    // Record transaction
    await client.query(
      `
      INSERT INTO inventory_transactions (
        product_id,
        transaction_type,
        quantity,
        reference_type,
        notes,
        created_by
      )
      VALUES (
        $1,
        'stock_in',
        $2,
        'manual',
        $3,
        $4
      )
      `,
      [
        productId,
        quantity,
        notes || null,
        userId || null,
      ]
    );

    await client.query("COMMIT");

    return updatedInventory.rows[0];

  } catch (error) {
    await client.query("ROLLBACK");
    throw error;

  } finally {
    client.release();
  }
};


// ============================================================
// STOCK OUT
// ============================================================

const stockOut = async (productId, quantity, notes, userId) => {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    // Lock inventory row
    const inventoryResult = await client.query(
      `
      SELECT *
      FROM inventory
      WHERE product_id = $1
      FOR UPDATE
      `,
      [productId]
    );

    if (inventoryResult.rows.length === 0) {
      throw new Error("Inventory record not found");
    }

    const inventory = inventoryResult.rows[0];

    // Prevent negative stock
    if (Number(inventory.quantity) < Number(quantity)) {
      throw new Error("Insufficient stock");
    }

    // Decrease stock
    const updatedInventory = await client.query(
      `
      UPDATE inventory
      SET
        quantity = quantity - $1,
        updated_at = CURRENT_TIMESTAMP
      WHERE product_id = $2
      RETURNING *
      `,
      [quantity, productId]
    );

    // Record transaction
    await client.query(
      `
      INSERT INTO inventory_transactions (
        product_id,
        transaction_type,
        quantity,
        reference_type,
        notes,
        created_by
      )
      VALUES (
        $1,
        'stock_out',
        $2,
        'manual',
        $3,
        $4
      )
      `,
      [
        productId,
        quantity,
        notes || null,
        userId || null,
      ]
    );

    await client.query("COMMIT");

    return updatedInventory.rows[0];

  } catch (error) {
    await client.query("ROLLBACK");
    throw error;

  } finally {
    client.release();
  }
};


// ============================================================
// GET INVENTORY TRANSACTIONS
// ============================================================

const getTransactions = async (productId) => {
  const result = await pool.query(
    `
    SELECT
      it.id,
      it.product_id,
      it.transaction_type,
      it.quantity,
      it.reference_type,
      it.reference_id,
      it.notes,
      it.created_at,

      p.name AS product_name,
      p.product_code

    FROM inventory_transactions it

    INNER JOIN products p
      ON it.product_id = p.id

    WHERE it.product_id = $1

    ORDER BY it.created_at DESC
    `,
    [productId]
  );

  return result.rows;
};


// ============================================================
// LOW STOCK PRODUCTS
// ============================================================

const getLowStock = async () => {
  const result = await pool.query(`
    SELECT
      i.id,
      i.product_id,
      i.quantity,
      i.minimum_stock,
      i.maximum_stock,
      i.unit,

      p.name AS product_name,
      p.product_code

    FROM inventory i

    INNER JOIN products p
      ON i.product_id = p.id

    WHERE i.quantity <= i.minimum_stock

    ORDER BY i.quantity ASC
  `);

  return result.rows;
};


module.exports = {
  getAllInventory,
  getInventoryByProduct,
  createInventory,
  updateInventory,
  stockIn,
  stockOut,
  getTransactions,
  getLowStock,
};