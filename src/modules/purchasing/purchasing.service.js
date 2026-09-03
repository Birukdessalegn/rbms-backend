const pool = require("../../config/database");

// ============================================================
// SUPPLIERS
// ============================================================

// Get all suppliers
const getAllSuppliers = async () => {
  const result = await pool.query(`
    SELECT
      id,
      supplier_code,
      name,
      contact_person,
      phone,
      email,
      address,
      tax_number,
      status,
      created_at,
      updated_at
    FROM suppliers
    ORDER BY name ASC
  `);

  return result.rows;
};


// Get supplier by ID
const getSupplierById = async (id) => {
  const result = await pool.query(
    `
    SELECT *
    FROM suppliers
    WHERE id = $1
    `,
    [id]
  );

  return result.rows[0];
};


// Create supplier
const createSupplier = async (data) => {
  const {
    supplierCode,
    name,
    contactPerson,
    phone,
    email,
    address,
    taxNumber,
    status,
  } = data;

  const result = await pool.query(
    `
    INSERT INTO suppliers (
      supplier_code,
      name,
      contact_person,
      phone,
      email,
      address,
      tax_number,
      status
    )
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
    RETURNING *
    `,
    [
      supplierCode || null,
      name,
      contactPerson || null,
      phone || null,
      email || null,
      address || null,
      taxNumber || null,
      status || "active",
    ]
  );

  return result.rows[0];
};


// ============================================================
// PURCHASE ORDERS
// ============================================================

// Get all purchase orders
const getAllPurchases = async () => {
  const result = await pool.query(`
    SELECT
      po.id,
      po.purchase_number,
      po.supplier_id,
      po.purchase_date,
      po.expected_date,
      po.subtotal,
      po.tax,
      po.discount,
      po.total,
      po.status,
      po.payment_status,
      po.payment_method,
      po.paid_amount,
      po.paid_at,
      po.notes,
      po.created_at,
      po.updated_at,

      s.name AS supplier_name,

      COALESCE(
        json_agg(
          json_build_object(
            'id', poi.id,
            'productId', poi.product_id,
            'product_id', poi.product_id,
            'name', p.name,
            'product_name', p.name,
            'quantity', poi.quantity,
            'unit_price', poi.unit_price,
            'total', poi.total,
            'unit', p.unit,
            'received_quantity', poi.received_quantity,
            'category_name', pc.name,
            'category_type', pc.type
          )
        ) FILTER (WHERE poi.id IS NOT NULL),
        '[]'
      ) AS items,

      COALESCE(SUM(poi.quantity), 0) AS total_items,
      COALESCE(COUNT(poi.id), 0) AS items_count

    FROM purchase_orders po

    LEFT JOIN suppliers s
      ON po.supplier_id = s.id

    LEFT JOIN purchase_order_items poi
      ON po.id = poi.purchase_order_id

    LEFT JOIN products p
      ON poi.product_id = p.id

    LEFT JOIN product_categories pc
      ON p.category_id = pc.id

    GROUP BY po.id, s.name

    ORDER BY po.created_at DESC
  `);

  return result.rows;
};


// Get purchase order with items
const getPurchaseById = async (id) => {
  const purchaseResult = await pool.query(
    `
    SELECT
      po.*,
      s.name AS supplier_name,
      s.phone AS supplier_phone,
      s.email AS supplier_email

    FROM purchase_orders po

    LEFT JOIN suppliers s
      ON po.supplier_id = s.id

    WHERE po.id = $1
    `,
    [id]
  );

  if (purchaseResult.rows.length === 0) {
    return null;
  }

  const itemsResult = await pool.query(
    `
    SELECT
      poi.id,
      poi.purchase_order_id,
      poi.product_id,
      poi.quantity,
      poi.unit_price,
      poi.total,
      poi.received_quantity,

      p.name AS product_name,
      p.product_code,
      p.unit

    FROM purchase_order_items poi

    INNER JOIN products p
      ON poi.product_id = p.id

    WHERE poi.purchase_order_id = $1

    ORDER BY poi.id ASC
    `,
    [id]
  );

  return {
    ...purchaseResult.rows[0],
    items: itemsResult.rows,
  };
};


// ============================================================
// CREATE PURCHASE ORDER
// ============================================================

const createPurchase = async (data) => {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const {
      purchaseNumber,
      supplierId,
      purchaseDate,
      expectedDate,
      tax,
      discount,
      notes,
      createdBy,
      paymentStatus,
      paymentMethod,
      items,
    } = data;

    if (!items || items.length === 0) {
      throw new Error("Purchase order must contain at least one item");
    }

    let subtotal = 0;

    for (const item of items) {
      const quantity = Number(item.quantity);
      const unitPrice = Number(item.unitPrice);

      if (quantity <= 0 || unitPrice < 0) {
        throw new Error("Invalid purchase item quantity or price");
      }

      subtotal += quantity * unitPrice;
    }

    const taxAmount = Number(tax || 0);
    const discountAmount = Number(discount || 0);

    const total =
      subtotal +
      taxAmount -
      discountAmount;

    const isPaid = paymentStatus === "paid";

    const purchaseResult = await client.query(
      `
      INSERT INTO purchase_orders (
        purchase_number,
        supplier_id,
        purchase_date,
        expected_date,
        subtotal,
        tax,
        discount,
        total,
        status,
        payment_status,
        payment_method,
        paid_amount,
        paid_at,
        notes,
        created_by
      )
      VALUES (
        $1,$2,
        COALESCE($3,CURRENT_DATE),
        $4,$5,$6,$7,$8,
        'ordered',
        $9,$10,$11,$12,$13,$14
      )
      RETURNING *
      `,
      [
        purchaseNumber,
        supplierId || null,
        purchaseDate || null,
        expectedDate || null,
        subtotal,
        taxAmount,
        discountAmount,
        total,
        paymentStatus || "credit",
        paymentMethod || "cash",
        isPaid ? total : 0,
        isPaid ? new Date() : null,
        notes || null,
        createdBy || null,
      ]
    );

    const purchase = purchaseResult.rows[0];

    for (const item of items) {
      const quantity = Number(item.quantity);
      const unitPrice = Number(item.unitPrice);
      const itemTotal = quantity * unitPrice;

      await client.query(
        `
        INSERT INTO purchase_order_items (
          purchase_order_id,
          product_id,
          quantity,
          unit_price,
          total,
          received_quantity
        )
        VALUES ($1,$2,$3,$4,$5,0)
        `,
        [
          purchase.id,
          item.productId,
          quantity,
          unitPrice,
          itemTotal,
        ]
      );
    }

    await client.query("COMMIT");

    return getPurchaseById(purchase.id);

  } catch (error) {
    await client.query("ROLLBACK");
    throw error;

  } finally {
    client.release();
  }
};


// ============================================================
// UPDATE PURCHASE ORDER
// ============================================================

const updatePurchase = async (id, data) => {
  const {
    supplierId,
    expectedDate,
    tax,
    discount,
    notes,
    status,
    paymentStatus,
    paymentMethod,
  } = data;

  const result = await pool.query(
    `
    UPDATE purchase_orders
    SET
      supplier_id = COALESCE($1, supplier_id),
      expected_date = COALESCE($2, expected_date),
      tax = COALESCE($3, tax),
      discount = COALESCE($4, discount),
      notes = COALESCE($5, notes),
      status = COALESCE($6, status),
      payment_status = COALESCE($7, payment_status),
      payment_method = COALESCE($8, payment_method),
      updated_at = CURRENT_TIMESTAMP
    WHERE id = $9
    RETURNING *
    `,
    [
      supplierId,
      expectedDate,
      tax,
      discount,
      notes,
      status,
      paymentStatus,
      paymentMethod,
      id,
    ]
  );

  if (result.rows.length === 0) {
    return null;
  }

  return getPurchaseById(id);
};


// ============================================================
// RECEIVE PURCHASE
// ============================================================

const receivePurchase = async (purchaseId, userId) => {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    // Lock purchase order
    const purchaseResult = await client.query(
      `
      SELECT *
      FROM purchase_orders
      WHERE id = $1
      FOR UPDATE
      `,
      [purchaseId]
    );

    if (purchaseResult.rows.length === 0) {
      throw new Error("Purchase order not found");
    }

    const purchase = purchaseResult.rows[0];

    if (purchase.status === "received") {
      throw new Error("Purchase order has already been received");
    }

    if (purchase.status === "cancelled") {
      throw new Error("Cancelled purchase cannot be received");
    }

    // Get items
    const itemsResult = await client.query(
      `
      SELECT *
      FROM purchase_order_items
      WHERE purchase_order_id = $1
      FOR UPDATE
      `,
      [purchaseId]
    );

    if (itemsResult.rows.length === 0) {
      throw new Error("Purchase order has no items");
    }

    for (const item of itemsResult.rows) {
      const remainingQuantity =
        Number(item.quantity) -
        Number(item.received_quantity || 0);

      if (remainingQuantity <= 0) {
        continue;
      }

      // Make sure inventory exists
      const inventoryResult = await client.query(
        `
        SELECT *
        FROM inventory
        WHERE product_id = $1
        FOR UPDATE
        `,
        [item.product_id]
      );

      if (inventoryResult.rows.length === 0) {
        // Create inventory automatically
        await client.query(
          `
          INSERT INTO inventory (
            product_id,
            quantity,
            minimum_stock,
            unit
          )
          VALUES ($1,$2,0,'pcs')
          `,
          [
            item.product_id,
            remainingQuantity,
          ]
        );

      } else {
        // Increase existing inventory
        await client.query(
          `
          UPDATE inventory
          SET
            quantity = quantity + $1,
            updated_at = CURRENT_TIMESTAMP
          WHERE product_id = $2
          `,
          [
            remainingQuantity,
            item.product_id,
          ]
        );
      }

      // Inventory transaction
      await client.query(
        `
        INSERT INTO inventory_transactions (
          product_id,
          transaction_type,
          quantity,
          reference_type,
          reference_id,
          notes,
          created_by
        )
        VALUES (
          $1,
          'stock_in',
          $2,
          'purchase',
          $3,
          'Stock received from purchase order',
          $4
        )
        `,
        [
          item.product_id,
          remainingQuantity,
          purchaseId,
          userId || null,
        ]
      );

      // Update received quantity
      await client.query(
        `
        UPDATE purchase_order_items
        SET received_quantity = quantity
        WHERE id = $1
        `,
        [item.id]
      );
    }

    // Mark purchase received
    const updatedPurchase = await client.query(
      `
      UPDATE purchase_orders
      SET
        status = 'received',
        updated_at = CURRENT_TIMESTAMP
      WHERE id = $1
      RETURNING *
      `,
      [purchaseId]
    );

    await client.query("COMMIT");

    return updatedPurchase.rows[0];

  } catch (error) {
    await client.query("ROLLBACK");
    throw error;

  } finally {
    client.release();
  }
};


// ============================================================
// DELETE / CANCEL PURCHASE
// ============================================================

const cancelPurchase = async (id) => {
  const result = await pool.query(
    `
    UPDATE purchase_orders
    SET
      status = 'cancelled',
      updated_at = CURRENT_TIMESTAMP
    WHERE id = $1
      AND status NOT IN ('received', 'cancelled')
    RETURNING *
    `,
    [id]
  );

  return result.rows[0];
};


// ============================================================
// PAY / MARK AS PAID PURCHASE ORDER
// ============================================================

const payPurchase = async (id, paymentMethod = "cash") => {
  const result = await pool.query(
    `
    UPDATE purchase_orders
    SET
      payment_status = 'paid',
      payment_method = COALESCE($1, payment_method, 'cash'),
      paid_amount = total,
      paid_at = CURRENT_TIMESTAMP,
      updated_at = CURRENT_TIMESTAMP
    WHERE id = $2
    RETURNING *
    `,
    [paymentMethod, id]
  );

  if (result.rows.length === 0) {
    return null;
  }

  return getPurchaseById(id);
};


module.exports = {
  getAllSuppliers,
  getSupplierById,
  createSupplier,

  getAllPurchases,
  getPurchaseById,
  createPurchase,
  updatePurchase,
  receivePurchase,
  cancelPurchase,

  payPurchase,
};
