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
        p.unit,
        p.image_url,
        p.is_available,
        p.is_active,
        p.created_at,
        p.updated_at,

        pc.id AS category_id,
        pc.name AS category_name,
        pc.type AS category_type

        FROM products p

        LEFT JOIN product_categories pc
        ON p.category_id = pc.id

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
        p.unit,
        p.image_url,
        p.is_available,
        p.is_active,
        p.created_at,
        p.updated_at,

        pc.id AS category_id,
        pc.name AS category_name,
        pc.type AS category_type

        FROM products p

        LEFT JOIN product_categories pc
        ON p.category_id = pc.id

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
        unit,
        imageUrl,
        isAvailable,
        isActive,
    } = data;

    const result = await pool.query(
        `
        INSERT INTO products (
        product_code,
        name,
        category_id,
        description,
        price,
        cost_price,
        unit,
        image_url,
        is_available,
        is_active
        )
        VALUES (
        $1, $2, $3, $4, $5,
        $6, $7, $8,
        COALESCE($9, TRUE),
        COALESCE($10, TRUE)
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
        unit || "pcs",
        imageUrl || null,
        isAvailable,
        isActive,
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
        unit,
        imageUrl,
        isAvailable,
        isActive,
    } = data;

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
        unit = COALESCE($7, unit),
        image_url = COALESCE($8, image_url),
        is_available = COALESCE($9, is_available),
        is_active = COALESCE($10, is_active),
        updated_at = CURRENT_TIMESTAMP
        WHERE id = $11
        RETURNING *
        `,
        [
        productCode,
        name,
        categoryId,
        description,
        price,
        costPrice,
        unit,
        imageUrl,
        isAvailable,
        isActive,
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


    module.exports = {
    getAllProducts,
    getProductById,
    createProduct,
    updateProduct,
    deleteProduct,
    getCategories,
    createCategory,
    };