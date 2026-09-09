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
      p.shots_capacity,
      p.is_shot_item,
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
// LOW STOCK PRODUCTS (ACROSS ALL LOCATIONS OR BY SPECIFIC LOCATION)
// ============================================================

const getLowStock = async (location = "all") => {
  const loc = (location || "all").toLowerCase();

  if (loc === "main") {
    const result = await pool.query(`
      SELECT
        i.id,
        'main' AS location,
        i.product_id,
        i.quantity,
        i.minimum_stock,
        i.maximum_stock,
        i.unit,
        p.name AS product_name,
        p.product_code,
        pc.name AS category_name
      FROM inventory i
      INNER JOIN products p ON i.product_id = p.id
      LEFT JOIN product_categories pc ON p.category_id = pc.id
      WHERE i.quantity <= i.minimum_stock
      ORDER BY i.quantity ASC
    `);
    return result.rows;
  }

  if (loc === "bar" || loc === "kitchen") {
    const result = await pool.query(
      `
      SELECT
        di.id,
        di.department AS location,
        di.product_id,
        di.quantity,
        di.minimum_stock,
        di.maximum_stock,
        di.unit,
        p.name AS product_name,
        p.product_code,
        pc.name AS category_name
      FROM department_inventory di
      INNER JOIN products p ON di.product_id = p.id
      LEFT JOIN product_categories pc ON p.category_id = pc.id
      WHERE di.department = $1 AND di.quantity <= di.minimum_stock
      ORDER BY di.quantity ASC
      `,
      [loc]
    );
    return result.rows;
  }

  // "all" locations: union main + bar + kitchen
  const result = await pool.query(`
    SELECT
      i.id,
      'main' AS location,
      i.product_id,
      i.quantity,
      i.minimum_stock,
      i.maximum_stock,
      i.unit,
      p.name AS product_name,
      p.product_code,
      pc.name AS category_name
    FROM inventory i
    INNER JOIN products p ON i.product_id = p.id
    LEFT JOIN product_categories pc ON p.category_id = pc.id
    WHERE i.quantity <= i.minimum_stock

    UNION ALL

    SELECT
      di.id,
      di.department AS location,
      di.product_id,
      di.quantity,
      di.minimum_stock,
      di.maximum_stock,
      di.unit,
      p.name AS product_name,
      p.product_code,
      pc.name AS category_name
    FROM department_inventory di
    INNER JOIN products p ON di.product_id = p.id
    LEFT JOIN product_categories pc ON p.category_id = pc.id
    WHERE di.quantity <= di.minimum_stock

    ORDER BY quantity ASC
  `);

  return result.rows;
};

// ============================================================
// GET DEPARTMENT INVENTORY (BAR OR KITCHEN)
// ============================================================

const getDepartmentInventory = async (department) => {
  const dept = (department || "").toLowerCase();

  const result = await pool.query(
    `
    SELECT
      di.id,
      di.department,
      di.product_id,
      di.quantity,
      di.minimum_stock,
      di.maximum_stock,
      di.unit,
      di.updated_at,

      p.name AS product_name,
      p.product_code,
      p.price,
      p.cost_price,
      p.shots_capacity,
      p.is_shot_item,
      p.image_url,
      pc.name AS category_name,
      pc.type AS category_type,

      CASE
        WHEN di.quantity <= 0 THEN 'out_of_stock'
        WHEN di.quantity <= di.minimum_stock THEN 'low_stock'
        ELSE 'in_stock'
      END AS stock_status,

      COALESCE(today_sold.sold_qty, 0)::NUMERIC(12,2) AS sold_today

    FROM department_inventory di

    JOIN products p
      ON di.product_id = p.id

    LEFT JOIN product_categories pc
      ON p.category_id = pc.id

    LEFT JOIN (
      SELECT oi.product_id, SUM(oi.quantity) AS sold_qty
      FROM order_items oi
      JOIN orders o ON oi.order_id = o.id
      WHERE o.status != 'cancelled' AND o.created_at::date = CURRENT_DATE
      GROUP BY oi.product_id
    ) today_sold ON di.product_id = today_sold.product_id

    WHERE di.department = $1

    ORDER BY p.name ASC
    `,
    [dept]
  );

  return result.rows;
};

// ============================================================
// GET MULTI-LOCATION INVENTORY MATRIX (CENTRAL vs BAR vs KITCHEN)
// ============================================================

const getMultiLocationInventory = async () => {
  const result = await pool.query(`
    SELECT
      p.id AS product_id,
      p.product_code,
      p.name AS product_name,
      p.price,
      p.cost_price,
      p.unit,
      p.shots_capacity,
      p.is_shot_item,
      p.image_url,
      pc.name AS category_name,
      pc.type AS category_type,

      -- Main Warehouse
      COALESCE(i.quantity, 0)::NUMERIC(12,2) AS main_quantity,
      COALESCE(i.minimum_stock, p.low_stock_threshold, 10)::NUMERIC(12,2) AS main_minimum_stock,
      COALESCE(p.out_of_stock_threshold, 0)::NUMERIC(12,2) AS main_out_of_stock_threshold,
      CASE
        WHEN COALESCE(i.quantity, 0) <= COALESCE(p.out_of_stock_threshold, 0) THEN 'out_of_stock'
        WHEN COALESCE(i.quantity, 0) <= COALESCE(i.minimum_stock, p.low_stock_threshold, 10) THEN 'low_stock'
        ELSE 'in_stock'
      END AS main_status,

      -- Bar Stock
      COALESCE(b.quantity, 0)::NUMERIC(12,2) AS bar_quantity,
      COALESCE(b.minimum_stock, p.low_stock_threshold, 5)::NUMERIC(12,2) AS bar_minimum_stock,
      COALESCE(b.out_of_stock_threshold, p.out_of_stock_threshold, 0)::NUMERIC(12,2) AS bar_out_of_stock_threshold,
      CASE
        WHEN COALESCE(b.quantity, 0) <= COALESCE(b.out_of_stock_threshold, p.out_of_stock_threshold, 0) THEN 'out_of_stock'
        WHEN COALESCE(b.quantity, 0) <= COALESCE(b.minimum_stock, p.low_stock_threshold, 5) THEN 'low_stock'
        ELSE 'in_stock'
      END AS bar_status,

      -- Kitchen Stock
      COALESCE(k.quantity, 0)::NUMERIC(12,2) AS kitchen_quantity,
      COALESCE(k.minimum_stock, p.low_stock_threshold, 5)::NUMERIC(12,2) AS kitchen_minimum_stock,
      COALESCE(k.out_of_stock_threshold, p.out_of_stock_threshold, 0)::NUMERIC(12,2) AS kitchen_out_of_stock_threshold,
      CASE
        WHEN COALESCE(k.quantity, 0) <= COALESCE(k.out_of_stock_threshold, p.out_of_stock_threshold, 0) THEN 'out_of_stock'
        WHEN COALESCE(k.quantity, 0) <= COALESCE(k.minimum_stock, p.low_stock_threshold, 5) THEN 'low_stock'
        ELSE 'in_stock'
      END AS kitchen_status,

      -- Product Default Thresholds
      COALESCE(p.low_stock_threshold, 5)::NUMERIC(12,2) AS low_stock_threshold,
      COALESCE(p.out_of_stock_threshold, 0)::NUMERIC(12,2) AS out_of_stock_threshold,

      -- Total on-hand across all stores
      (COALESCE(i.quantity, 0) + COALESCE(b.quantity, 0) + COALESCE(k.quantity, 0))::NUMERIC(12,2) AS total_quantity,

      -- Sold Today
      COALESCE(today_sold.sold_qty, 0)::NUMERIC(12,2) AS sold_today

    FROM products p

    LEFT JOIN inventory i ON p.id = i.product_id

    LEFT JOIN department_inventory b ON p.id = b.product_id AND b.department = 'bar'

    LEFT JOIN department_inventory k ON p.id = k.product_id AND k.department = 'kitchen'

    LEFT JOIN product_categories pc ON p.category_id = pc.id

    LEFT JOIN (
      SELECT oi.product_id, SUM(oi.quantity) AS sold_qty
      FROM order_items oi
      JOIN orders o ON oi.order_id = o.id
      WHERE o.status != 'cancelled' AND o.created_at::date = CURRENT_DATE
      GROUP BY oi.product_id
    ) today_sold ON p.id = today_sold.product_id

    WHERE p.is_active = TRUE

    ORDER BY p.name ASC
  `);

  return result.rows;
};

// ============================================================
// UPDATE DEPARTMENT / STORE STOCK SETTINGS (MIN/MAX/OUT-OF-STOCK)
// ============================================================

const updateDepartmentStockSettings = async (department, productId, data) => {
  const { minimumStock, maximumStock, outOfStockThreshold } = data;
  const dept = (department || "all").toLowerCase();

  const minVal = minimumStock !== undefined && minimumStock !== null && minimumStock !== "" ? Number(minimumStock) : null;
  const maxVal = maximumStock !== undefined && maximumStock !== null && maximumStock !== "" ? Number(maximumStock) : null;
  const outVal = outOfStockThreshold !== undefined && outOfStockThreshold !== null && outOfStockThreshold !== "" ? Number(outOfStockThreshold) : 0;

  // 1. Update Product defaults if provided
  if (minVal !== null || outVal !== null) {
    await pool.query(
      `
      UPDATE products
      SET
        low_stock_threshold = COALESCE($2, low_stock_threshold),
        out_of_stock_threshold = COALESCE($3, out_of_stock_threshold),
        updated_at = CURRENT_TIMESTAMP
      WHERE id = $1
      `,
      [productId, minVal, outVal]
    );
  }

  // 2. Department-specific or All stores update
  if (dept === "all") {
    // Update Central Warehouse
    await pool.query(
      `
      INSERT INTO inventory (product_id, minimum_stock, maximum_stock, updated_at)
      VALUES ($1, COALESCE($2, 10), $3, CURRENT_TIMESTAMP)
      ON CONFLICT (product_id)
      DO UPDATE SET
        minimum_stock = COALESCE($2, inventory.minimum_stock),
        maximum_stock = COALESCE($3, inventory.maximum_stock),
        updated_at = CURRENT_TIMESTAMP
      `,
      [productId, minVal, maxVal]
    );

    // Update both Bar & Kitchen
    for (const d of ["bar", "kitchen"]) {
      await pool.query(
        `
        INSERT INTO department_inventory (
          department, product_id, minimum_stock, maximum_stock, out_of_stock_threshold, updated_at
        )
        VALUES ($1, $2, COALESCE($3, 5), $4, COALESCE($5, 0), CURRENT_TIMESTAMP)
        ON CONFLICT (department, product_id)
        DO UPDATE SET
          minimum_stock = COALESCE($3, department_inventory.minimum_stock),
          maximum_stock = COALESCE($4, department_inventory.maximum_stock),
          out_of_stock_threshold = COALESCE($5, department_inventory.out_of_stock_threshold),
          updated_at = CURRENT_TIMESTAMP
        `,
        [d, productId, minVal, maxVal, outVal]
      );
    }
  } else if (dept === "main" || dept === "warehouse") {
    await pool.query(
      `
      INSERT INTO inventory (product_id, minimum_stock, maximum_stock, updated_at)
      VALUES ($1, COALESCE($2, 10), $3, CURRENT_TIMESTAMP)
      ON CONFLICT (product_id)
      DO UPDATE SET
        minimum_stock = COALESCE($2, inventory.minimum_stock),
        maximum_stock = COALESCE($3, inventory.maximum_stock),
        updated_at = CURRENT_TIMESTAMP
      `,
      [productId, minVal, maxVal]
    );
  } else {
    // Bar or Kitchen
    await pool.query(
      `
      INSERT INTO department_inventory (
        department,
        product_id,
        minimum_stock,
        maximum_stock,
        out_of_stock_threshold,
        updated_at
      )
      VALUES ($1, $2, COALESCE($3, 5), $4, COALESCE($5, 0), CURRENT_TIMESTAMP)
      ON CONFLICT (department, product_id)
      DO UPDATE SET
        minimum_stock = COALESCE($3, department_inventory.minimum_stock),
        maximum_stock = COALESCE($4, department_inventory.maximum_stock),
        out_of_stock_threshold = COALESCE($5, department_inventory.out_of_stock_threshold),
        updated_at = CURRENT_TIMESTAMP
      `,
      [dept, productId, minVal, maxVal, outVal]
    );
  }

  return { success: true, department: dept, productId, minimumStock: minVal, outOfStockThreshold: outVal };
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
  getDepartmentInventory,
  getMultiLocationInventory,
  updateDepartmentStockSettings,
};