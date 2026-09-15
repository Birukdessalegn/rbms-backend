const pool = require("../../config/database");

// Get all products
const getAllProducts = async () => {
  const result = await pool.query(`
    SELECT
      p.id,
      p.product_code,
      p.name,
      p.description,
      p.price,
      p.cost_price,
      p.staff_price,
      p.unit,
      p.image_url,
      p.is_available,
      p.is_active,
      p.menu_type,
      p.is_todays_special,
      p.parent_product_id,
      p.portion_ratio,
      p.serving_size,
      p.shots_capacity,
      p.is_shot_item,
      COALESCE(p.applicable_for, 'both') AS applicable_for,
      parent_p.name AS parent_product_name,
      p.created_at,
      p.updated_at,

      pc.id AS category_id,
      pc.name AS category_name,
      pc.type AS category_type,

      -- Real-time Department & Warehouse stock
      COALESCE(b.quantity, 0)::NUMERIC(12,2) AS bar_stock,
      COALESCE(b.minimum_stock, p.low_stock_threshold, 5)::NUMERIC(12,2) AS bar_min_stock,
      COALESCE(b.out_of_stock_threshold, p.out_of_stock_threshold, 0)::NUMERIC(12,2) AS bar_out_of_stock_threshold,
      COALESCE(k.quantity, 0)::NUMERIC(12,2) AS kitchen_stock,
      COALESCE(k.minimum_stock, p.low_stock_threshold, 5)::NUMERIC(12,2) AS kitchen_min_stock,
      COALESCE(k.out_of_stock_threshold, p.out_of_stock_threshold, 0)::NUMERIC(12,2) AS kitchen_out_of_stock_threshold,
      COALESCE(i.quantity, 0)::NUMERIC(12,2) AS main_stock,
      COALESCE(i.minimum_stock, p.low_stock_threshold, 0)::NUMERIC(12,2) AS main_min_stock,

      -- Product Default Thresholds
      COALESCE(p.low_stock_threshold, 5)::NUMERIC(12,2) AS low_stock_threshold,
      COALESCE(p.out_of_stock_threshold, 0)::NUMERIC(12,2) AS out_of_stock_threshold,

      -- Department-resolved current stock
      CASE
        WHEN p.portion_ratio > 0 AND LOWER(COALESCE(pc.type, '')) IN ('beverage', 'bar')
          THEN FLOOR(COALESCE(b.quantity, 0) / p.portion_ratio)::NUMERIC(12,2)
        WHEN LOWER(COALESCE(pc.type, '')) = 'food' THEN COALESCE(k.quantity, 0)::NUMERIC(12,2)
        WHEN LOWER(COALESCE(pc.type, '')) IN ('beverage', 'bar') THEN COALESCE(b.quantity, 0)::NUMERIC(12,2)
        ELSE (COALESCE(b.quantity, 0) + COALESCE(k.quantity, 0) + COALESCE(i.quantity, 0))::NUMERIC(12,2)
      END AS current_stock,

      -- Department-resolved minimum stock
      CASE
        WHEN LOWER(COALESCE(pc.type, '')) = 'food' THEN COALESCE(k.minimum_stock, p.low_stock_threshold, 5)::NUMERIC(12,2)
        WHEN LOWER(COALESCE(pc.type, '')) IN ('beverage', 'bar') THEN COALESCE(b.minimum_stock, p.low_stock_threshold, 5)::NUMERIC(12,2)
        ELSE COALESCE(i.minimum_stock, p.low_stock_threshold, 5)::NUMERIC(12,2)
      END AS minimum_stock,

      -- Department-resolved out of stock threshold
      CASE
        WHEN LOWER(COALESCE(pc.type, '')) = 'food' THEN COALESCE(k.out_of_stock_threshold, p.out_of_stock_threshold, 0)::NUMERIC(12,2)
        WHEN LOWER(COALESCE(pc.type, '')) IN ('beverage', 'bar') THEN COALESCE(b.out_of_stock_threshold, p.out_of_stock_threshold, 0)::NUMERIC(12,2)
        ELSE COALESCE(p.out_of_stock_threshold, 0)::NUMERIC(12,2)
      END AS out_of_stock_threshold_resolved,

      -- Department name
      CASE
        WHEN LOWER(COALESCE(pc.type, '')) = 'food' THEN 'Kitchen'
        WHEN LOWER(COALESCE(pc.type, '')) IN ('beverage', 'bar') THEN 'Bar'
        ELSE 'Store'
      END AS stock_department

    FROM products p

    LEFT JOIN product_categories pc
      ON p.category_id = pc.id

    LEFT JOIN products parent_p
      ON p.parent_product_id = parent_p.id

    LEFT JOIN department_inventory b
      ON COALESCE(p.parent_product_id, p.id) = b.product_id AND b.department = 'bar'

    LEFT JOIN department_inventory k
      ON COALESCE(p.parent_product_id, p.id) = k.product_id AND k.department = 'kitchen'

    LEFT JOIN inventory i
      ON COALESCE(p.parent_product_id, p.id) = i.product_id

    ORDER BY p.created_at DESC
  `);

  return result.rows;
};


// Get product by ID
const getProductById = async (id) => {
  const result = await pool.query(
    `
    SELECT
      p.id,
      p.product_code,
      p.name,
      p.description,
      p.price,
      p.cost_price,
      p.staff_price,
      p.unit,
      p.image_url,
      p.is_available,
      p.is_active,
      p.menu_type,
      p.is_todays_special,
      p.parent_product_id,
      p.portion_ratio,
      p.serving_size,
      p.shots_capacity,
      p.is_shot_item,
      COALESCE(p.applicable_for, 'both') AS applicable_for,
      COALESCE(p.low_stock_threshold, 5)::NUMERIC(12,2) AS low_stock_threshold,
      COALESCE(p.out_of_stock_threshold, 0)::NUMERIC(12,2) AS out_of_stock_threshold,
      parent_p.name AS parent_product_name,
      p.created_at,
      p.updated_at,

      pc.id AS category_id,
      pc.name AS category_name,
      pc.type AS category_type

    FROM products p

    LEFT JOIN product_categories pc
      ON p.category_id = pc.id

    LEFT JOIN products parent_p
      ON p.parent_product_id = parent_p.id

    WHERE p.id = $1
    `,
    [id]
  );

  return result.rows[0];
};


// Create product
const createProduct = async (data) => {
  const {
    productCode,
    name,
    categoryId,
    description,
    price,
    costPrice,
    staffPrice,
    unit,
    imageUrl,
    isAvailable,
    isActive,
    menuType,
    isTodaysSpecial,
    parentProductId,
    portionRatio,
    servingSize,
    lowStockThreshold,
    outOfStockThreshold,
    applicable_for,
    applicableFor,
  } = data;

  const resolvedApplicableFor = applicable_for || applicableFor || "both";
  const shotsCapacity = data.shotsCapacity !== undefined ? data.shotsCapacity : data.shots_capacity;
  const isShotItem = data.isShotItem !== undefined ? data.isShotItem : data.is_shot_item;

  const result = await pool.query(
    `
    INSERT INTO products (
      product_code,
      name,
      category_id,
      description,
      price,
      cost_price,
      staff_price,
      unit,
      image_url,
      is_available,
      is_active,
      menu_type,
      is_todays_special,
      parent_product_id,
      portion_ratio,
      serving_size,
      shots_capacity,
      is_shot_item,
      low_stock_threshold,
      out_of_stock_threshold,
      applicable_for
    )
    VALUES (
      $1, $2, $3, $4, $5,
      $6, $7, $8, $9,
      COALESCE($10, TRUE),
      COALESCE($11, TRUE),
      COALESCE($12, 'both'),
      COALESCE($13, FALSE),
      $14,
      COALESCE($15, 1.0000),
      COALESCE($16, 'unit'),
      COALESCE($17, 30),
      COALESCE($18, FALSE),
      COALESCE($19, 5),
      COALESCE($20, 0),
      COALESCE($21, 'both')
    )
    RETURNING *
    `,
    [
      productCode || null,
      name,
      categoryId || null,
      description || null,
      price || 0,
      costPrice || 0,
      staffPrice || 0,
      unit || "pcs",
      imageUrl || null,
      isAvailable,
      isActive,
      menuType || "both",
      isTodaysSpecial || false,
      parentProductId || null,
      portionRatio !== undefined && portionRatio !== null ? Number(portionRatio) : 1.0,
      servingSize || "unit",
      shotsCapacity !== undefined && shotsCapacity !== null && shotsCapacity !== "" ? parseInt(shotsCapacity, 10) : 30,
      isShotItem !== undefined && isShotItem !== null ? (isShotItem === true || isShotItem === "true" || isShotItem === 1 || isShotItem === "1") : false,
      lowStockThreshold !== undefined && lowStockThreshold !== null ? Number(lowStockThreshold) : 5,
      outOfStockThreshold !== undefined && outOfStockThreshold !== null ? Number(outOfStockThreshold) : 0,
      resolvedApplicableFor,
    ]
  );

  return result.rows[0];
};


// Update product
const updateProduct = async (id, data) => {
  const {
    productCode,
    name,
    categoryId,
    description,
    price,
    costPrice,
    staffPrice,
    unit,
    imageUrl,
    isAvailable,
    isActive,
    menuType,
    isTodaysSpecial,
    parentProductId,
    portionRatio,
    servingSize,
    lowStockThreshold,
    outOfStockThreshold,
    applicable_for,
    applicableFor,
  } = data;

  const resolvedApplicableFor =
    applicable_for !== undefined
      ? applicable_for
      : applicableFor !== undefined
      ? applicableFor
      : null;

  const shotsCapacity = data.shotsCapacity !== undefined ? data.shotsCapacity : data.shots_capacity;
  const isShotItem = data.isShotItem !== undefined ? data.isShotItem : data.is_shot_item;

  const result = await pool.query(
    `
    UPDATE products
    SET
      product_code = COALESCE($1, product_code),
      name = COALESCE($2, name),
      category_id = COALESCE($3, category_id),
      description = COALESCE($4, description),
      price = COALESCE($5, price),
      cost_price = COALESCE($6, cost_price),
      staff_price = COALESCE($7, staff_price),
      unit = COALESCE($8, unit),
      image_url = COALESCE($9, image_url),
      is_available = COALESCE($10, is_available),
      is_active = COALESCE($11, is_active),
      menu_type = COALESCE($12, menu_type),
      is_todays_special = COALESCE($13, is_todays_special),
      parent_product_id = CASE WHEN $14::text = 'null' THEN NULL WHEN $14 IS NOT NULL THEN $14::integer ELSE parent_product_id END,
      portion_ratio = COALESCE($15, portion_ratio),
      serving_size = COALESCE($16, serving_size),
      shots_capacity = COALESCE($17, shots_capacity),
      is_shot_item = COALESCE($18, is_shot_item),
      low_stock_threshold = COALESCE($19, low_stock_threshold),
      out_of_stock_threshold = COALESCE($20, out_of_stock_threshold),
      applicable_for = COALESCE($21, applicable_for),
      updated_at = CURRENT_TIMESTAMP
    WHERE id = $22
    RETURNING *
    `,
    [
      productCode,
      name,
      categoryId,
      description,
      price,
      costPrice,
      staffPrice,
      unit,
      imageUrl,
      isAvailable,
      isActive,
      menuType,
      isTodaysSpecial,
      parentProductId !== undefined ? parentProductId : null,
      portionRatio !== undefined ? Number(portionRatio) : null,
      servingSize !== undefined ? servingSize : null,
      shotsCapacity !== undefined && shotsCapacity !== null && shotsCapacity !== "" ? parseInt(shotsCapacity, 10) : null,
      isShotItem !== undefined && isShotItem !== null ? (isShotItem === true || isShotItem === "true" || isShotItem === 1 || isShotItem === "1") : null,
      lowStockThreshold !== undefined && lowStockThreshold !== null ? Number(lowStockThreshold) : null,
      outOfStockThreshold !== undefined && outOfStockThreshold !== null ? Number(outOfStockThreshold) : null,
      resolvedApplicableFor,
      id,
    ]
  );

  return result.rows[0];
};


// Delete product
// We deactivate instead of physically deleting it.
const deleteProduct = async (id) => {
  const result = await pool.query(
    `
    UPDATE products
    SET
      is_active = FALSE,
      is_available = FALSE,
      updated_at = CURRENT_TIMESTAMP
    WHERE id = $1
    RETURNING *
    `,
    [id]
  );

  return result.rows[0];
};


// Get product categories
const getCategories = async () => {
  try {
    await pool.query(`
      INSERT INTO product_categories (name, description, type)
      VALUES ('Fruit', 'Fresh fruit items', 'food')
      ON CONFLICT (name) DO NOTHING
    `);
  } catch (err) {
    // If table or constraint is not yet present, silently fall through
  }

  const result = await pool.query(`
    SELECT
      id,
      name,
      description,
      type,
      created_at
    FROM product_categories
    ORDER BY name ASC
  `);

  return result.rows;
};


// Create category
const createCategory = async (data) => {
  const {
    name,
    description,
    type,
  } = data;

  const result = await pool.query(
    `
    INSERT INTO product_categories (
      name,
      description,
      type
    )
    VALUES ($1, $2, $3)
    RETURNING *
    `,
    [
      name,
      description || null,
      type || "food",
    ]
  );

  return result.rows[0];
};


// ============================================================
// GET MENU (CUSTOMER vs EMPLOYEE / STAFF)
// ============================================================
const getMenu = async (menuType) => {
  let query = `
    SELECT
      p.id,
      p.product_code,
      p.name,
      p.description,
      p.price,
      p.cost_price,
      p.staff_price,
      p.unit,
      p.image_url,
      p.is_available,
      p.is_active,
      p.menu_type,
      p.is_todays_special,
      p.parent_product_id,
      p.portion_ratio,
      p.serving_size,
      p.shots_capacity,
      p.is_shot_item,
      COALESCE(p.applicable_for, 'both') AS applicable_for,
      p.created_at,
      p.updated_at,

      pc.id AS category_id,
      pc.name AS category_name,
      pc.type AS category_type

    FROM products p

    LEFT JOIN product_categories pc
      ON p.category_id = pc.id

    WHERE p.is_active = TRUE AND p.is_available = TRUE
  `;

  const values = [];

  if (menuType === "customer") {
    query += ` AND (p.menu_type = 'customer' OR p.menu_type = 'both')`;
  } else if (menuType === "employee") {
    query += ` AND (p.menu_type = 'employee' OR p.menu_type = 'both')`;
  }

  query += ` ORDER BY pc.name ASC, p.name ASC`;

  const result = await pool.query(query, values);
  return result.rows;
};


// ============================================================
// UPDATE PRODUCT MENU SETTINGS (FOR MANAGERS)
// ============================================================
const updateProductMenu = async (id, data) => {
  const {
    menuType,
    isAvailable,
    isTodaysSpecial,
    staffPrice,
  } = data;

  const result = await pool.query(
    `
    UPDATE products
    SET
      menu_type = COALESCE($1, menu_type),
      is_available = COALESCE($2, is_available),
      is_todays_special = COALESCE($3, is_todays_special),
      staff_price = COALESCE($4, staff_price),
      updated_at = CURRENT_TIMESTAMP
    WHERE id = $5
    RETURNING *
    `,
    [
      menuType || null,
      isAvailable !== undefined ? isAvailable : null,
      isTodaysSpecial !== undefined ? isTodaysSpecial : null,
      staffPrice !== undefined ? staffPrice : null,
      id,
    ]
  );

  return result.rows[0];
};


module.exports = {
  getAllProducts,
  getProductById,
  createProduct,
  updateProduct,
  deleteProduct,
  getCategories,
  createCategory,

  getMenu,
  updateProductMenu,
};
