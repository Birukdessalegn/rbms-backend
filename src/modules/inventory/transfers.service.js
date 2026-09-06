const pool = require("../../config/database");
const notificationsService = require("../notifications/notifications.service");

// Helper to generate unique transfer number
const generateTransferNumber = () => {
  const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const randomSuffix = Math.floor(1000 + Math.random() * 9000);
  return `TRF-${dateStr}-${randomSuffix}`;
};

// ============================================================
// CREATE / DISPATCH DIRECT TRANSFER
// ============================================================

const createTransfer = async ({
  fromLocation = "main",
  toLocation,
  items,
  notes,
  userId,
}) => {
  if (!toLocation || !["bar", "kitchen"].includes(toLocation.toLowerCase())) {
    throw new Error("Invalid destination location. Must be 'bar' or 'kitchen'.");
  }

  if (!items || !Array.isArray(items) || items.length === 0) {
    throw new Error("Transfer must include at least one item.");
  }

  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const transferNumber = generateTransferNumber();

    // 1. Create transfer record
    const transferResult = await client.query(
      `
      INSERT INTO stock_transfers (
        transfer_number,
        from_location,
        to_location,
        status,
        dispatched_by,
        notes
      )
      VALUES ($1, $2, $3, 'completed', $4, $5)
      RETURNING *
      `,
      [
        transferNumber,
        fromLocation.toLowerCase(),
        toLocation.toLowerCase(),
        userId || null,
        notes || null,
      ]
    );

    const transfer = transferResult.rows[0];
    const lowStockAlerts = [];

    // 2. Process each transfer item
    for (const item of items) {
      const productId = item.productId || item.product_id;
      const quantity = Number(item.quantity);

      if (!productId || isNaN(quantity) || quantity <= 0) {
        throw new Error("Invalid product or quantity in transfer item list");
      }

      // Check product and source inventory
      const productResult = await client.query(
        `
        SELECT id, name, unit, product_code
        FROM products
        WHERE id = $1
        `,
        [productId]
      );

      if (productResult.rows.length === 0) {
        throw new Error(`Product with ID ${productId} not found`);
      }

      const product = productResult.rows[0];

      if (fromLocation.toLowerCase() === "main") {
        const invResult = await client.query(
          `
          SELECT quantity, minimum_stock
          FROM inventory
          WHERE product_id = $1
          FOR UPDATE
          `,
          [productId]
        );

        const currentMainStock =
          invResult.rows.length > 0 ? Number(invResult.rows[0].quantity) : 0;

        if (currentMainStock < quantity) {
          throw new Error(
            `Insufficient stock in Central Store for "${product.name}". Available: ${currentMainStock}, Requested: ${quantity}`
          );
        }

        // Deduct from Central Inventory
        const updatedMain = await client.query(
          `
          UPDATE inventory
          SET quantity = quantity - $1, updated_at = CURRENT_TIMESTAMP
          WHERE product_id = $2
          RETURNING quantity, minimum_stock
          `,
          [quantity, productId]
        );

        // Record central inventory transaction
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
          VALUES ($1, 'stock_out', $2, 'transfer_out', $3, $4, $5)
          `,
          [
            productId,
            quantity,
            transfer.id,
            `Transferred to ${toLocation.toUpperCase()} (${transferNumber})`,
            userId || null,
          ]
        );

        // Check if main store is now low stock
        const newMainQty = Number(updatedMain.rows[0].quantity);
        const minMainStock = Number(updatedMain.rows[0].minimum_stock || 0);
        if (newMainQty <= minMainStock) {
          lowStockAlerts.push({
            name: product.name,
            location: "Central Store",
            remaining: newMainQty,
            min: minMainStock,
          });
        }
      }

      // Add to Department Inventory (Bar or Kitchen)
      await client.query(
        `
        INSERT INTO department_inventory (
          department,
          product_id,
          quantity,
          unit,
          updated_at
        )
        VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP)
        ON CONFLICT (department, product_id)
        DO UPDATE SET
          quantity = department_inventory.quantity + EXCLUDED.quantity,
          updated_at = CURRENT_TIMESTAMP
        `,
        [
          toLocation.toLowerCase(),
          productId,
          quantity,
          product.unit || "pcs",
        ]
      );

      // Record department inventory transaction
      await client.query(
        `
        INSERT INTO department_inventory_transactions (
          department,
          product_id,
          transaction_type,
          quantity,
          reference_type,
          reference_id,
          notes,
          created_by
        )
        VALUES ($1, $2, 'transfer_in', $3, 'transfer', $4, $5, $6)
        `,
        [
          toLocation.toLowerCase(),
          productId,
          quantity,
          transfer.id,
          `Received from ${fromLocation.toUpperCase()} (${transferNumber})`,
          userId || null,
        ]
      );

      // Insert transfer item
      await client.query(
        `
        INSERT INTO stock_transfer_items (
          transfer_id,
          product_id,
          quantity,
          notes
        )
        VALUES ($1, $2, $3, $4)
        `,
        [transfer.id, productId, quantity, item.notes || null]
      );
    }

    await client.query("COMMIT");

    // Notifications outside transaction block
    // 1. Transfer completed notification
    await notificationsService.createNotification({
      title: "Stock Transfer Dispatched",
      message: `Transfer ${transferNumber}: ${items.length} items transferred from ${fromLocation.toUpperCase()} to ${toLocation.toUpperCase()}.`,
      type: "info",
      referenceType: "transfer",
      referenceId: transfer.id,
    });

    // 2. Central low stock warnings
    for (const alert of lowStockAlerts) {
      await notificationsService.createNotification({
        title: "Central Store Low Stock Alert",
        message: `"${alert.name}" in Central Store is down to ${alert.remaining} (Minimum: ${alert.min}). Supplier reorder recommended.`,
        type: "warning",
        referenceType: "inventory_low_stock",
      });
    }

    return getTransferById(transfer.id);
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
};

// ============================================================
// CREATE REQUISITION REQUEST (FROM BAR / KITCHEN TO F&B)
// ============================================================

const requestTransfer = async ({
  toLocation,
  items,
  notes,
  userId,
}) => {
  if (!toLocation || !["bar", "kitchen"].includes(toLocation.toLowerCase())) {
    throw new Error("Invalid department requesting stock. Must be 'bar' or 'kitchen'.");
  }

  if (!items || !Array.isArray(items) || items.length === 0) {
    throw new Error("Request must include at least one item.");
  }

  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const transferNumber = generateTransferNumber();

    const transferResult = await client.query(
      `
      INSERT INTO stock_transfers (
        transfer_number,
        from_location,
        to_location,
        status,
        requested_by,
        notes
      )
      VALUES ($1, 'main', $2, 'pending', $3, $4)
      RETURNING *
      `,
      [
        transferNumber,
        toLocation.toLowerCase(),
        userId || null,
        notes || null,
      ]
    );

    const transfer = transferResult.rows[0];

    for (const item of items) {
      const productId = item.productId || item.product_id;
      const quantity = Number(item.quantity);

      await client.query(
        `
        INSERT INTO stock_transfer_items (
          transfer_id,
          product_id,
          quantity,
          notes
        )
        VALUES ($1, $2, $3, $4)
        `,
        [transfer.id, productId, quantity, item.notes || null]
      );
    }

    await client.query("COMMIT");

    // Notify F&B Manager
    await notificationsService.createNotification({
      targetRoles: ["admin", "manager"],
      title: `${toLocation.toUpperCase()} Stock Requisition Request`,
      message: `${toLocation.toUpperCase()} has requested a restock of ${items.length} items (${transferNumber}).`,
      type: "requisition",
      referenceType: "transfer",
      referenceId: transfer.id,
    });

    return getTransferById(transfer.id);
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
};

// ============================================================
// GET TRANSFER BY ID
// ============================================================

const getTransferById = async (id) => {
  const transferResult = await pool.query(
    `
    SELECT
      st.id,
      st.transfer_number,
      st.from_location,
      st.to_location,
      st.status,
      st.notes,
      st.created_at,
      st.updated_at,
      u_req.username AS requested_by_username,
      u_disp.username AS dispatched_by_username,
      u_rec.username AS received_by_username
    FROM stock_transfers st
    LEFT JOIN users u_req ON st.requested_by = u_req.id
    LEFT JOIN users u_disp ON st.dispatched_by = u_disp.id
    LEFT JOIN users u_rec ON st.received_by = u_rec.id
    WHERE st.id = $1
    `,
    [id]
  );

  if (transferResult.rows.length === 0) {
    return null;
  }

  const transfer = transferResult.rows[0];

  const itemsResult = await pool.query(
    `
    SELECT
      sti.id,
      sti.product_id,
      sti.quantity,
      sti.notes,
      p.name AS product_name,
      p.product_code,
      p.unit,
      pc.name AS category_name
    FROM stock_transfer_items sti
    JOIN products p ON sti.product_id = p.id
    LEFT JOIN product_categories pc ON p.category_id = pc.id
    WHERE sti.transfer_id = $1
    ORDER BY p.name ASC
    `,
    [id]
  );

  transfer.items = itemsResult.rows;
  return transfer;
};

// ============================================================
// GET ALL TRANSFERS
// ============================================================

const getTransfers = async ({ status, toLocation, fromLocation, limit = 50 } = {}) => {
  let query = `
    SELECT
      st.id,
      st.transfer_number,
      st.from_location,
      st.to_location,
      st.status,
      st.notes,
      st.created_at,
      st.updated_at,
      u_disp.username AS dispatched_by_username,
      u_req.username AS requested_by_username,
      (SELECT COUNT(*) FROM stock_transfer_items sti WHERE sti.transfer_id = st.id) AS total_items,
      (SELECT COALESCE(SUM(quantity), 0) FROM stock_transfer_items sti WHERE sti.transfer_id = st.id) AS total_quantity,
      (
        SELECT COALESCE(json_agg(json_build_object(
          'id', sti.id,
          'product_id', sti.product_id,
          'product_name', p.name,
          'quantity', sti.quantity,
          'unit', p.unit
        )), '[]'::json)
        FROM stock_transfer_items sti
        JOIN products p ON sti.product_id = p.id
        WHERE sti.transfer_id = st.id
      ) AS items
    FROM stock_transfers st
    LEFT JOIN users u_disp ON st.dispatched_by = u_disp.id
    LEFT JOIN users u_req ON st.requested_by = u_req.id
    WHERE 1=1
  `;
  const params = [];

  if (status) {
    params.push(status);
    query += ` AND st.status = $${params.length}`;
  }

  if (toLocation) {
    params.push(toLocation.toLowerCase());
    query += ` AND st.to_location = $${params.length}`;
  }

  if (fromLocation) {
    params.push(fromLocation.toLowerCase());
    query += ` AND st.from_location = $${params.length}`;
  }

  query += ` ORDER BY st.created_at DESC`;

  if (limit) {
    params.push(limit);
    query += ` LIMIT $${params.length}`;
  }

  const result = await pool.query(query, params);
  return result.rows;
};

// ============================================================
// APPROVE REQUISITION / TRANSFER (F&B CONTROLLER)
// ============================================================

const approveTransfer = async (id, { userId, notes } = {}) => {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const transferRes = await client.query(
      `SELECT * FROM stock_transfers WHERE id = $1 FOR UPDATE`,
      [id]
    );

    if (transferRes.rows.length === 0) {
      throw new Error(`Transfer #${id} not found.`);
    }

    const transfer = transferRes.rows[0];

    if (transfer.status !== "pending") {
      throw new Error(`Cannot approve transfer. Status is already '${transfer.status}'.`);
    }

    const itemsRes = await client.query(
      `SELECT sti.*, p.name AS product_name, p.unit
       FROM stock_transfer_items sti
       JOIN products p ON sti.product_id = p.id
       WHERE sti.transfer_id = $1`,
      [id]
    );

    const items = itemsRes.rows;
    if (items.length === 0) {
      throw new Error("No items in this transfer.");
    }

    // Process each item: deduct from main, add to kitchen/bar
    for (const item of items) {
      const productId = item.product_id;
      const quantity = Number(item.quantity);

      if (transfer.from_location === "main") {
        const invRes = await client.query(
          `SELECT quantity FROM inventory WHERE product_id = $1 FOR UPDATE`,
          [productId]
        );

        const currentStock = invRes.rows.length > 0 ? Number(invRes.rows[0].quantity) : 0;
        if (currentStock < quantity) {
          throw new Error(
            `Insufficient stock in Central Store for "${item.product_name}". Available: ${currentStock}, Requested: ${quantity}`
          );
        }

        await client.query(
          `UPDATE inventory SET quantity = quantity - $1, updated_at = CURRENT_TIMESTAMP WHERE product_id = $2`,
          [quantity, productId]
        );

        await client.query(
          `INSERT INTO inventory_transactions (product_id, transaction_type, quantity, reference_type, reference_id, notes, created_by)
           VALUES ($1, 'stock_out', $2, 'transfer_approved', $3, $4, $5)`,
          [productId, quantity, transfer.id, `F&B Controller approved restock to ${transfer.to_location.toUpperCase()}`, userId || null]
        );
      }

      // Add to department inventory
      await client.query(
        `INSERT INTO department_inventory (department, product_id, quantity, unit, updated_at)
         VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP)
         ON CONFLICT (department, product_id)
         DO UPDATE SET quantity = department_inventory.quantity + $3, updated_at = CURRENT_TIMESTAMP`,
        [transfer.to_location, productId, quantity, item.unit || "pcs"]
      );

      await client.query(
        `INSERT INTO department_inventory_transactions (department, product_id, transaction_type, quantity, reference_type, reference_id, notes, created_by)
         VALUES ($1, $2, 'transfer_in', $3, 'transfer_approved', $4, $5, $6)`,
        [transfer.to_location, productId, quantity, transfer.id, `Received from ${transfer.from_location.toUpperCase()} via F&B Controller approval`, userId || null]
      );
    }

    // Mark transfer as completed & approved
    await client.query(
      `UPDATE stock_transfers
       SET status = 'completed',
           approved_by = $1,
           approved_at = CURRENT_TIMESTAMP,
           dispatched_by = COALESCE(dispatched_by, $1),
           notes = COALESCE($2, notes),
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $3
       RETURNING *`,
      [userId || null, notes || null, id]
    );

    await client.query("COMMIT");

    return getTransferById(id);
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
};

// ============================================================
// REJECT REQUISITION / TRANSFER (F&B CONTROLLER)
// ============================================================

const rejectTransfer = async (id, { userId, notes } = {}) => {
  const result = await pool.query(
    `UPDATE stock_transfers
     SET status = 'cancelled',
         rejection_reason = $1,
         approved_by = $2,
         approved_at = CURRENT_TIMESTAMP,
         updated_at = CURRENT_TIMESTAMP
     WHERE id = $3 AND status = 'pending'
     RETURNING *`,
    [notes || "Rejected by F&B Controller", userId || null, id]
  );

  if (result.rows.length === 0) {
    throw new Error(`Pending transfer #${id} not found or already processed.`);
  }

  return getTransferById(id);
};

module.exports = {
  createTransfer,
  requestTransfer,
  approveTransfer,
  rejectTransfer,
  getTransferById,
  getTransfers,
};
