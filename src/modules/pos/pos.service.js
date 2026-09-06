const pool = require("../../config/database");
const notificationsService = require("../notifications/notifications.service");

// ============================================================
// GET ALL POS ORDERS
// ============================================================

const getAllOrders = async () => {
  const result = await pool.query(`
    SELECT
      o.id,
      o.order_number,
      o.customer_id,
      o.table_id,
      o.waiter_id,
      o.bartender_id,
      o.is_bar_order,
      o.order_type,
      o.subtotal,
      o.discount,
      o.tax,
      o.total,
      o.status,
      o.payment_status,
      o.notes,
      o.created_at,
      o.updated_at,

      rt.table_number,
      rt.is_bar_seat,
      rt.type AS table_type,
      rt.section AS table_section,

      e.first_name AS waiter_first_name,
      e.last_name AS waiter_last_name,
      COALESCE(e.first_name || ' ' || e.last_name, u.username) AS waiter_name,

      eb.first_name AS bartender_first_name,
      eb.last_name AS bartender_last_name,
      COALESCE(eb.first_name || ' ' || eb.last_name, ub.username) AS bartender_name,

      COALESCE(
        (SELECT SUM(p.amount) FROM payments p WHERE p.order_id = o.id AND p.status = 'paid'),
        0
      ) AS paid_amount

    FROM orders o

    LEFT JOIN restaurant_tables rt
      ON o.table_id = rt.id

    LEFT JOIN employees e
      ON o.waiter_id = e.id

    LEFT JOIN users u
      ON e.user_id = u.id

    LEFT JOIN employees eb
      ON o.bartender_id = eb.id

    LEFT JOIN users ub
      ON eb.user_id = ub.id

    ORDER BY o.created_at DESC
  `);

  const orders = result.rows;

  if (orders.length > 0) {
    const orderIds = orders.map((o) => o.id);
    const paymentsResult = await pool.query(
      `
      SELECT
        id,
        order_id,
        amount,
        payment_method,
        reference,
        status,
        paid_at,
        COALESCE(receipt_image, image_url) AS image_url,
        COALESCE(receipt_image, image_url) AS receipt_image,
        COALESCE(receipt_image, image_url) AS receipt_url,
        (COALESCE(receipt_image, image_url) IS NOT NULL) AS has_receipt
      FROM payments
      WHERE order_id = ANY($1::int[])
      ORDER BY paid_at DESC
      `,
      [orderIds]
    );

    const paymentsByOrderId = {};
    for (const payment of paymentsResult.rows) {
      if (!paymentsByOrderId[payment.order_id]) {
        paymentsByOrderId[payment.order_id] = [];
      }
      paymentsByOrderId[payment.order_id].push(payment);
    }

    for (const order of orders) {
      order.payments = paymentsByOrderId[order.id] || [];
    }
  }

  return orders;
};


// ============================================================
// GET ORDER BY ID
// ============================================================

const getOrderById = async (id) => {
  const orderResult = await pool.query(
    `
    SELECT
      o.id,
      o.order_number,
      o.customer_id,
      o.table_id,
      o.waiter_id,
      o.bartender_id,
      o.is_bar_order,
      o.order_type,
      o.subtotal,
      o.discount,
      o.tax,
      o.total,
      o.status,
      o.payment_status,
      o.notes,
      o.created_at,
      o.updated_at,

      rt.table_number,
      rt.is_bar_seat,
      rt.type AS table_type,
      rt.section AS table_section,

      e.first_name AS waiter_first_name,
      e.last_name AS waiter_last_name,
      COALESCE(e.first_name || ' ' || e.last_name, u.username) AS waiter_name,

      eb.first_name AS bartender_first_name,
      eb.last_name AS bartender_last_name,
      COALESCE(eb.first_name || ' ' || eb.last_name, ub.username) AS bartender_name

    FROM orders o

    LEFT JOIN restaurant_tables rt
      ON o.table_id = rt.id

    LEFT JOIN employees e
      ON o.waiter_id = e.id

    LEFT JOIN users u
      ON e.user_id = u.id

    LEFT JOIN employees eb
      ON o.bartender_id = eb.id

    LEFT JOIN users ub
      ON eb.user_id = ub.id

    WHERE o.id::text = $1 OR o.order_number = $1
    `,
    [String(id).trim()]
  );

  if (orderResult.rows.length === 0) {
    return null;
  }

  const order = orderResult.rows[0];


  // ============================================================
  // GET ORDER ITEMS
  // ============================================================

  const itemsResult = await pool.query(
    `
    SELECT
      oi.id,
      oi.product_id,
      oi.quantity,
      oi.unit_price,
      oi.discount,
      oi.total,
      oi.notes,
      oi.status,

      p.name AS product_name,
      p.unit

    FROM order_items oi

    JOIN products p
      ON oi.product_id = p.id

    WHERE oi.order_id = $1

    ORDER BY oi.id ASC
    `,
    [order.id]
  );

  order.items = itemsResult.rows;


  // ============================================================
  // GET PAYMENTS
  // ============================================================

  const paymentsResult = await pool.query(
    `
    SELECT
      id,
      amount,
      payment_method,
      reference,
      status,
      paid_at,
      COALESCE(receipt_image, image_url) AS image_url,
      COALESCE(receipt_image, image_url) AS receipt_image,
      COALESCE(receipt_image, image_url) AS receipt_url,
      (COALESCE(receipt_image, image_url) IS NOT NULL) AS has_receipt
    FROM payments
    WHERE order_id = $1
    ORDER BY paid_at DESC
    `,
    [order.id]
  );

  order.payments = paymentsResult.rows;

  return order;
};


// ============================================================
// CREATE POS ORDER
// ============================================================

const createOrder = async (order) => {
  const {
    orderNumber,
    customerId,
    vipCustomerId,
    vip_customer_id,
    tableId,
    waiterId,
    orderType,
    items,
    subtotal,
    tax,
    discount,
    total,
    notes,
    is_bar_order,
    bartenderId,
    bartender_id,
  } = order;

  const targetVipId = vipCustomerId || vip_customer_id || null;

  const client = await pool.connect();

  try {
    await client.query("BEGIN");


    // ============================================================
    // FIND EMPLOYEE USING LOGGED-IN USER ID
    // ============================================================

    let employeeId = null;

    if (waiterId) {
      const employeeResult = await client.query(
        `
        SELECT
          id,
          first_name,
          last_name,
          role_id,
          user_id
        FROM employees
        WHERE user_id = $1
        LIMIT 1
        `,
        [waiterId]
      );

      if (employeeResult.rows.length > 0) {
        employeeId = employeeResult.rows[0].id;
      }
    }

    // ============================================================
    // RESOLVE BARTENDER IDENTITY & BAR ORDER STATUS
    // ============================================================
    const roleName = String(order.user?.role || "").toLowerCase();
    const isBartenderRole =
      roleName.includes("bartender") ||
      order.user?.role_id === 8;

    let resolvedBartenderId = bartenderId || bartender_id || null;
    if (!resolvedBartenderId && isBartenderRole && employeeId) {
      resolvedBartenderId = employeeId;
    }


    // ============================================================
    // VALIDATE TABLE ID & ENFORCE WAITER TABLE OWNERSHIP
    // ============================================================
    let validTableId = null;
    let isTableBarSeat = false;

    if (tableId && Number.isInteger(Number(tableId)) && Number(tableId) > 0) {
      const tableCheck = await client.query(
        `
        SELECT
          t.id,
          t.table_number,
          t.status,
          t.is_bar_seat,
          t.current_waiter_id,
          e.first_name AS assigned_first_name,
          e.last_name AS assigned_last_name
        FROM restaurant_tables t
        LEFT JOIN employees e
          ON t.current_waiter_id = e.id
        WHERE t.id = $1
        FOR UPDATE OF t
        `,
        [Number(tableId)]
      );

      if (tableCheck.rows.length > 0) {
        const targetTable = tableCheck.rows[0];
        validTableId = targetTable.id;
        isTableBarSeat = Boolean(targetTable.is_bar_seat);

        const isElevatedRole =
          roleName.includes("admin") ||
          roleName.includes("manager") ||
          roleName.includes("cashier") ||
          isBartenderRole ||
          isTableBarSeat;

        if (
          targetTable.status === "occupied" &&
          targetTable.current_waiter_id &&
          employeeId &&
          Number(targetTable.current_waiter_id) !== Number(employeeId) &&
          !isElevatedRole
        ) {
          const assignedName =
            [targetTable.assigned_first_name, targetTable.assigned_last_name]
              .filter(Boolean)
              .join(" ") || `Waiter #${targetTable.current_waiter_id}`;

          throw new Error(
            `Table ${targetTable.table_number} is currently occupied by ${assignedName}. You cannot place orders on another waiter's table.`
          );
        }
      }
    }

    const finalIsBarOrder = Boolean(is_bar_order || isBartenderRole || isTableBarSeat);


    // ============================================================
    // CREATE MAIN ORDER
    // ============================================================

    const result = await client.query(
      `
      INSERT INTO orders (
        order_number,
        customer_id,
        vip_customer_id,
        table_id,
        waiter_id,
        bartender_id,
        is_bar_order,
        order_type,
        subtotal,
        tax,
        discount,
        total,
        status,
        payment_status,
        notes
      )
      VALUES (
        $1,
        $2,
        $3,
        $4,
        $5,
        $6,
        $7,
        $8,
        $9,
        $10,
        $11,
        $12,
        'pending',
        'pending',
        $13
      )
      RETURNING *
      `,
      [
        orderNumber || null,
        customerId || null,
        targetVipId,
        validTableId,
        employeeId,
        resolvedBartenderId,
        finalIsBarOrder,
        orderType || "dine_in",
        subtotal || 0,
        tax || 0,
        discount || 0,
        total || 0,
        notes || null,
      ]
    );

    const createdOrder = result.rows[0];


    // ============================================================
    // CREATE ORDER ITEMS
    // GET REAL PRICE + CATEGORY FROM DATABASE
    // ============================================================

    const createdOrderItems = [];

    const kitchenItems = [];
    const barItems = [];
    const deptLowStockAlerts = [];

    let calculatedSubtotal = 0;

    if (items && items.length > 0) {

      for (const item of items) {

        // ========================================================
        // GET PRODUCT FROM DATABASE
        // ========================================================

        const rawId = item.productId || item.product_id;
        const cleanProductId = typeof rawId === "string" && rawId.includes("_")
          ? parseInt(rawId.split("_")[0], 10)
          : parseInt(rawId, 10);

        const productResult = await client.query(
          `
          SELECT
            p.id,
            p.name,
            p.price,
            p.unit,
            p.category_id,
            p.parent_product_id,
            p.portion_ratio,
            p.serving_size,
            p.shots_capacity,
            p.is_shot_item,
            pc.name AS category_name,
            pc.type AS category_type

          FROM products p

          LEFT JOIN product_categories pc
            ON p.category_id = pc.id

          WHERE p.id = $1
          `,
          [cleanProductId]
        );


        if (productResult.rows.length === 0) {
          throw new Error(
            `Product with ID ${cleanProductId || rawId} not found`
          );
        }


        const product = productResult.rows[0];


        // ========================================================
        // USE REAL PRODUCT PRICE (OR PORTION PRICE IF SPECIFIED)
        // ========================================================

        const unitPrice = Number(item.price || item.unitPrice || item.unit_price || product.price || 0);

        const quantity = Number(
          item.quantity || 0
        );


        if (quantity <= 0) {
          throw new Error(
            `Invalid quantity for product ${product.name}`
          );
        }


        // ========================================================
        // CALCULATE ITEM TOTAL
        // ========================================================

        const itemTotal = quantity * unitPrice;

        calculatedSubtotal += itemTotal;


        // ========================================================
        // CREATE ORDER ITEM
        // ========================================================

        const itemResult = await client.query(
          `
          INSERT INTO order_items (
            order_id,
            product_id,
            quantity,
            unit_price,
            total,
            notes
          )
          VALUES (
            $1,
            $2,
            $3,
            $4,
            $5,
            $6
          )
          RETURNING *
          `,
          [
            createdOrder.id,
            product.id,
            quantity,
            unitPrice,
            itemTotal,
            item.notes || null,
          ]
        );


        const createdItem = itemResult.rows[0];

        createdOrderItems.push(createdItem);


        // ========================================================
        // DETERMINE WHERE PRODUCT SHOULD GO
        // ========================================================

        const categoryType = product.category_type?.toLowerCase();


        // Kitchen Products
        if (categoryType === "food") {
          kitchenItems.push(createdItem);
        }
        // Bar Products
        else if (categoryType === "beverage" || categoryType === "bar") {
          barItems.push(createdItem);
        }
        else {
          console.log(
            `Product "${product.name}" has category "${categoryType}" and will not be sent to kitchen or bar.`
          );
        }

        // ========================================================
        // AUTOMATIC STOCK DEDUCTION FROM BAR / KITCHEN SUB-STORE
        // WITH PARENT-PRODUCT PORTION CONVERSION (SHOTS / HALF BOTTLE)
        // ========================================================
        let targetDepartment = null;
        if (categoryType === "food") {
          targetDepartment = "kitchen";
        } else if (categoryType === "beverage" || categoryType === "bar") {
          targetDepartment = "bar";
        }

        if (targetDepartment) {
          let stockProductId = product.id;
          let stockProductName = product.name;
          let stockUnit = product.unit || "pcs";
          let effectiveDeductionQty = Number(quantity);

          // If item is a portion (shot, half bottle, etc.), link to parent bottle
          if (product.parent_product_id) {
            const parentCheck = await client.query(
              "SELECT id, name, unit FROM products WHERE id = $1",
              [product.parent_product_id]
            );
            if (parentCheck.rows.length > 0) {
              stockProductId = parentCheck.rows[0].id;
              stockProductName = parentCheck.rows[0].name;
              stockUnit = parentCheck.rows[0].unit || "bottle";
              const ratio = Number(product.portion_ratio || 1.0);
              effectiveDeductionQty = Number((quantity * ratio).toFixed(4));
            }
          } else if (item.shotsDeduction) {
            const bottleCapacity = Number(product.shots_capacity) > 0 ? Number(product.shots_capacity) : 30;
            const ratio = Number(item.shotsDeduction) / bottleCapacity;
            effectiveDeductionQty = Number((quantity * ratio).toFixed(4));
          }

          const deptStockResult = await client.query(
            `
            INSERT INTO department_inventory (
              department,
              product_id,
              quantity,
              minimum_stock,
              unit,
              updated_at
            )
            VALUES ($1, $2, (0 - $3::numeric), 5, $4, CURRENT_TIMESTAMP)
            ON CONFLICT (department, product_id)
            DO UPDATE SET
              quantity = department_inventory.quantity - $3::numeric,
              updated_at = CURRENT_TIMESTAMP
            RETURNING quantity, minimum_stock
            `,
            [targetDepartment, stockProductId, effectiveDeductionQty, stockUnit]
          );

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
            VALUES ($1, $2, 'pos_sale', $3, 'order', $4, $5, $6)
            `,
            [
              targetDepartment,
              stockProductId,
              effectiveDeductionQty,
              createdOrder.id,
              product.parent_product_id
                ? `POS Portion Sale - Order #${createdOrder.order_number || createdOrder.id}: ${quantity}x ${product.name} (deducted ${effectiveDeductionQty} ${stockUnit} of ${stockProductName})`
                : `POS Sale - Order #${createdOrder.order_number || createdOrder.id}`,
              order.user?.id || employeeId || null,
            ]
          );

          const remainingQty = Number(deptStockResult.rows[0].quantity);
          const minQty = Number(deptStockResult.rows[0].minimum_stock || 0);

          if (remainingQty <= minQty) {
            deptLowStockAlerts.push({
              productName: stockProductName,
              department: targetDepartment,
              remaining: remainingQty,
              min: minQty,
            });
          }
        }
      }
    }


    // ============================================================
    // UPDATE ORDER TOTALS
    // USING REAL DATABASE PRODUCT PRICES
    // ============================================================

    const calculatedDiscount = Number(discount || 0);
    let calculatedTax = Number(tax || 0);

    // If tax is not provided or is 0, auto-calculate 15% VAT + 10% Service Charge (25% total fees)
    if (calculatedTax === 0) {
      const vat = Number((calculatedSubtotal * 0.15).toFixed(2));
      const serviceCharge = Number((calculatedSubtotal * 0.10).toFixed(2));
      calculatedTax = Number((vat + serviceCharge).toFixed(2));
    }

    const calculatedTotal = Number(
      (calculatedSubtotal - calculatedDiscount + calculatedTax).toFixed(2)
    );

    const updatedOrderResult = await client.query(
      `
      UPDATE orders
      SET
        subtotal = $1,
        discount = $2,
        tax = $3,
        total = $4,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = $5
      RETURNING *
      `,
      [
        calculatedSubtotal,
        calculatedDiscount,
        calculatedTax,
        calculatedTotal,
        createdOrder.id,
      ]
    );


    // Keep createdOrder synchronized
    Object.assign(createdOrder, updatedOrderResult.rows[0]);


    // ============================================================
    // CREATE KITCHEN ORDER
    // ONLY IF THERE ARE FOOD ITEMS
    // ============================================================

    if (kitchenItems.length > 0) {

      const kitchenOrderResult = await client.query(
        `
        INSERT INTO kitchen_orders (
          order_id,
          chef_id,
          notes,
          status
        )
        VALUES (
          $1,
          $2,
          $3,
          'pending'
        )
        RETURNING *
        `,
        [
          createdOrder.id,
          null,
          notes || null,
        ]
      );


      const kitchenOrder = kitchenOrderResult.rows[0];


      // Create Kitchen Order Items
      for (const orderItem of kitchenItems) {
        await client.query(
          `
          INSERT INTO kitchen_order_items (
            kitchen_order_id,
            order_item_id,
            quantity,
            status
          )
          VALUES (
            $1,
            $2,
            $3,
            'pending'
          )
          `,
          [
            kitchenOrder.id,
            orderItem.id,
            orderItem.quantity,
          ]
        );
      }
    }


    // ============================================================
    // CREATE BAR ORDER
    // ONLY IF THERE ARE DRINK ITEMS
    // ============================================================

    if (barItems.length > 0) {

      const barOrderResult = await client.query(
        `
        INSERT INTO bar_orders (
          order_id,
          bartender_id,
          notes,
          status
        )
        VALUES (
          $1,
          $2,
          $3,
          'pending'
        )
        RETURNING *
        `,
        [
          createdOrder.id,
          resolvedBartenderId || null,
          notes || null,
        ]
      );

      const barOrder = barOrderResult.rows[0];

      // Create Bar Order Items
      for (const orderItem of barItems) {
        await client.query(
          `
          INSERT INTO bar_order_items (
            bar_order_id,
            order_item_id,
            quantity,
            status
          )
          VALUES (
            $1,
            $2,
            $3,
            'pending'
          )
          `,
          [
            barOrder.id,
            orderItem.id,
            orderItem.quantity,
          ]
        );
      }
    }


    // ============================================================
    // MARK TABLE AS OCCUPIED
    // ============================================================

    if (validTableId) {
      await client.query(
        `
        UPDATE restaurant_tables
        SET status = 'occupied', current_waiter_id = $1
        WHERE id = $2
        `,
        [employeeId, validTableId]
      );
    }


    // ============================================================
    // COMMIT EVERYTHING
    // ============================================================

    await client.query("COMMIT");

    // ============================================================
    // SEND LOW STOCK NOTIFICATIONS FOR BAR / KITCHEN
    // ============================================================
    for (const alert of deptLowStockAlerts) {
      notificationsService.createNotification({
        targetRoles: ["admin", "manager"],
        title: `${alert.department.toUpperCase()} Low Stock Alert`,
        message: `"${alert.productName}" in ${alert.department.toUpperCase()} is running low (${alert.remaining} remaining, minimum: ${alert.min}). F&B restock required!`,
        type: "warning",
        referenceType: "department_low_stock",
      }).catch((err) => console.error("Error sending department low stock notification:", err.message));
    }

    return createdOrder;

  } catch (error) {

    await client.query("ROLLBACK");

    console.error("CREATE ORDER ERROR:", error);

    throw error;

  } finally {

    client.release();

  }
};


// ============================================================
// UPDATE ORDER STATUS
// ============================================================

const updateOrderStatus = async (id, status) => {
  const result = await pool.query(
    `
    UPDATE orders
    SET
      status = $1,
      updated_at = CURRENT_TIMESTAMP
    WHERE id::text = $2 OR order_number = $2
    RETURNING *
    `,
    [status, String(id).trim()]
  );

  return result.rows[0] || null;
};


const createPayment = async (orderId, data) => {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const { amount, paymentMethod, reference, receivedBy, status, vipCustomerId, vip_customer_id, customerId } = data;
    const targetVipId = vipCustomerId || vip_customer_id || customerId || null;
    const finalImageUrl =
      data.receiptImage ||
      data.imageUrl ||
      data.image_url ||
      data.receipt_image ||
      data.receiptUrl ||
      data.receipt_url ||
      data.proofImage ||
      data.proof_image ||
      null;

    let validReceivedBy = null;
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    if (receivedBy && uuidRegex.test(String(receivedBy))) {
      validReceivedBy = receivedBy;
    }

    // Validate Order ID or Order Number
    if (!orderId || String(orderId).trim() === "") {
      throw new Error("Order ID or order number is required");
    }

    // Validate Payment Amount
    const paymentAmount = Number(amount);

    if (!Number.isFinite(paymentAmount) || paymentAmount <= 0) {
      throw new Error("Invalid payment amount");
    }

    if (!paymentMethod) {
      throw new Error("Payment method is required");
    }

    // 1. Fetch Order with FOR UPDATE lock (supports numeric id or order_number)
    const orderResult = await client.query(
      `
      SELECT id, total, payment_status, status, table_id
      FROM orders
      WHERE id::text = $1 OR order_number = $1
      FOR UPDATE
      `,
      [String(orderId).trim()]
    );

    if (orderResult.rows.length === 0) {
      throw new Error("Order not found");
    }

    const order = orderResult.rows[0];
    const realNumericDbId = order.id;
    let orderTotal = Number(order.total || 0);

    // 2. Calculate Previously Paid Amount
    const paidResult = await client.query(
      `
      SELECT COALESCE(SUM(amount), 0) AS paid_amount
      FROM payments
      WHERE order_id = $1 AND status = 'paid'
      `,
      [realNumericDbId]
    );

    const alreadyPaid = Number(paidResult.rows[0].paid_amount || 0);

    // Update order total if payment amount exceeds stored DB total
    if (alreadyPaid + paymentAmount > orderTotal) {
      await client.query(
        `
        UPDATE orders
        SET total = $1, updated_at = CURRENT_TIMESTAMP
        WHERE id = $2
        `,
        [alreadyPaid + paymentAmount, realNumericDbId]
      );
      orderTotal = alreadyPaid + paymentAmount;
    }

    const currentRemaining = orderTotal - alreadyPaid;

    if (paymentAmount > currentRemaining + 0.05) {
      throw new Error(
        `Payment exceeds remaining balance of ${currentRemaining.toFixed(2)}`
      );
    }

    // 3. Insert Payment Ledger Entry
    let activeShiftId = null;
    if (validReceivedBy) {
      const shiftCheck = await client.query(
        `SELECT id FROM cashier_shifts WHERE cashier_id = $1 AND status = 'open' ORDER BY start_time DESC LIMIT 1`,
        [validReceivedBy]
      );
      if (shiftCheck.rows.length > 0) {
        activeShiftId = shiftCheck.rows[0].id;
      }
    }

    const paymentStatusParam = status || "paid";
    const paymentResult = await client.query(
      `
      INSERT INTO payments (
        order_id,
        amount,
        payment_method,
        reference,
        status,
        received_by,
        image_url,
        receipt_image,
        vip_customer_id,
        cashier_shift_id,
        paid_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $7, $8, $9, CURRENT_TIMESTAMP)
      RETURNING *, paid_at AS created_at
      `,
      [
        realNumericDbId,
        paymentAmount,
        paymentMethod,
        reference || null,
        paymentStatusParam,
        validReceivedBy,
        finalImageUrl,
        targetVipId,
        activeShiftId,
      ]
    );

    if (targetVipId) {
      await client.query(
        `UPDATE orders SET vip_customer_id = $1 WHERE id = $2 AND vip_customer_id IS NULL`,
        [targetVipId, realNumericDbId]
      );
    }

    const createdPayment = paymentResult.rows[0];

    // 4. Compute Cumulative Paid Amount & Remaining Balance
    const newPaidResult = await client.query(
      `
      SELECT COALESCE(SUM(amount), 0) AS paid_amount
      FROM payments
      WHERE order_id = $1 AND status = 'paid'
      `,
      [realNumericDbId]
    );

    const totalPaid = Number(newPaidResult.rows[0].paid_amount || 0);
    const remainingBalance = Math.max(
      Number((orderTotal - totalPaid).toFixed(2)),
      0
    );
    const isFullyPaid = remainingBalance <= 0.05;

    // 5. Update Order & Table Statuses
    const dbPaymentStatus = isFullyPaid
      ? "paid"
      : totalPaid > 0
      ? "partial"
      : "pending";
    const dbOrderStatus = isFullyPaid ? "completed" : order.status;

    await client.query(
      `
      UPDATE orders
      SET
        payment_status = $1,
        status = $2,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = $3
      `,
      [dbPaymentStatus, dbOrderStatus, realNumericDbId]
    );

    // Release table if order is fully settled
    if (isFullyPaid && order.table_id) {
      await client.query(
        `
        UPDATE restaurant_tables
        SET status = 'available', current_waiter_id = NULL
        WHERE id = $1
        `,
        [order.table_id]
      );
    }

    await client.query("COMMIT");

    return {
      payment: createdPayment,
      totalPaid,
      remainingBalance,
      isFullyPaid,
    };
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("CREATE PAYMENT ERROR:", error);
    throw error;
  } finally {
    client.release();
  }
};


// ============================================================
// GET ALL RESTAURANT TABLES
// ============================================================

const getAllTables = async () => {
  const result = await pool.query(`
    SELECT
      t.id,
      t.table_number,
      t.capacity,
      t.location,
      t.is_bar_seat,
      t.type,
      t.section,
      t.status,
      t.current_waiter_id,
      t.created_at,

      e.first_name AS waiter_first_name,
      e.last_name AS waiter_last_name,
      COALESCE(e.first_name || ' ' || e.last_name, u.username) AS current_waiter_name

    FROM restaurant_tables t

    LEFT JOIN employees e
      ON t.current_waiter_id = e.id

    LEFT JOIN users u
      ON e.user_id = u.id

    ORDER BY t.id ASC
  `);

  return result.rows;
};


// ============================================================
// CREATE RESTAURANT TABLE / BAR STOOL
// ============================================================

const createTable = async (data) => {
  const tableNumber = data.tableNumber || data.table_number;
  const capacity = Number(data.capacity) || 2;
  const location = data.location || null;
  const isBarSeat = Boolean(data.is_bar_seat || data.isBarSeat);
  const type = data.type || (isBarSeat ? "bar" : "dining");
  const section = data.section || (isBarSeat ? "BAR" : type === "vip" ? "VIP" : "DINING");
  const status = data.status || "available";

  const result = await pool.query(
    `
    INSERT INTO restaurant_tables (
      table_number,
      capacity,
      location,
      is_bar_seat,
      type,
      section,
      status
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7)
    RETURNING *
    `,
    [tableNumber, capacity, location, isBarSeat, type, section, status]
  );

  return result.rows[0];
};


// ============================================================
// UPDATE RESTAURANT TABLE / BAR STOOL
// ============================================================

const updateTable = async (id, data) => {
  const tableNumber = data.tableNumber !== undefined ? data.tableNumber : data.table_number;
  const capacity = data.capacity !== undefined ? Number(data.capacity) : undefined;
  const location = data.location !== undefined ? data.location : undefined;
  const isBarSeat = data.is_bar_seat !== undefined ? Boolean(data.is_bar_seat) : (data.isBarSeat !== undefined ? Boolean(data.isBarSeat) : undefined);
  const type = data.type !== undefined ? data.type : undefined;
  const section = data.section !== undefined ? data.section : undefined;
  const status = data.status !== undefined ? data.status : undefined;
  const currentWaiterId = data.current_waiter_id !== undefined ? data.current_waiter_id : (data.currentWaiterId !== undefined ? data.currentWaiterId : undefined);

  const result = await pool.query(
    `
    UPDATE restaurant_tables
    SET
      table_number = COALESCE($1, table_number),
      capacity = COALESCE($2, capacity),
      location = COALESCE($3, location),
      is_bar_seat = COALESCE($4, is_bar_seat),
      type = COALESCE($5, type),
      section = COALESCE($6, section),
      status = COALESCE($7, status),
      current_waiter_id = CASE
        WHEN $8::text = 'NULL' THEN NULL
        WHEN $8::integer IS NOT NULL THEN $8::integer
        ELSE current_waiter_id
      END
    WHERE id = $9
    RETURNING *
    `,
    [
      tableNumber ?? null,
      capacity ?? null,
      location ?? null,
      isBarSeat ?? null,
      type ?? null,
      section ?? null,
      status ?? null,
      currentWaiterId === null ? 'NULL' : (currentWaiterId ?? null),
      id,
    ]
  );

  return result.rows[0] || null;
};


// ============================================================
// UPDATE TABLE STATUS (e.g. occupied, available)
// ============================================================

const updateTableStatus = async (id, status, waiterId = null) => {
  const result = await pool.query(
    `
    UPDATE restaurant_tables
    SET
      status = $1,
      current_waiter_id = CASE
        WHEN $1 = 'available' THEN NULL
        WHEN $2::integer IS NOT NULL THEN $2::integer
        ELSE current_waiter_id
      END
    WHERE id = $3
    RETURNING *
    `,
    [status, waiterId || null, id]
  );

  return result.rows[0] || null;
};


// ============================================================
// DELETE RESTAURANT TABLE (WITH ORDER UNLINKING)
// ============================================================

const deleteTable = async (id) => {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // 1. Unlink past orders so sales history is preserved
    await client.query(
      `UPDATE orders SET table_id = NULL WHERE table_id = $1`,
      [id]
    );

    // 2. Delete the table safely
    const result = await client.query(
      `DELETE FROM restaurant_tables WHERE id = $1 RETURNING *`,
      [id]
    );

    await client.query("COMMIT");
    return result.rows[0] || null;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
};


// ============================================================
// HELPER: ADJUST DEPARTMENT INVENTORY STOCK (ADD / RESTORE)
// ============================================================

const adjustDepartmentStock = async (
  client,
  product,
  quantity,
  targetDepartment,
  orderId,
  orderNumber,
  userId,
  isRestore = false,
  reason = ""
) => {
  if (!targetDepartment) return;

  let stockProductId = product.id;
  let stockProductName = product.name;
  let stockUnit = product.unit || "pcs";
  let effectiveQty = Number(quantity);

  if (product.parent_product_id) {
    const parentCheck = await client.query(
      "SELECT id, name, unit FROM products WHERE id = $1",
      [product.parent_product_id]
    );
    if (parentCheck.rows.length > 0) {
      stockProductId = parentCheck.rows[0].id;
      stockProductName = parentCheck.rows[0].name;
      stockUnit = parentCheck.rows[0].unit || "bottle";
      const ratio = Number(product.portion_ratio || 1.0);
      effectiveQty = Number((quantity * ratio).toFixed(4));
    }
  }

  const delta = isRestore ? effectiveQty : -effectiveQty;

  await client.query(
    `
    INSERT INTO department_inventory (
      department,
      product_id,
      quantity,
      minimum_stock,
      unit,
      updated_at
    )
    VALUES ($1, $2, $3, 5, $4, CURRENT_TIMESTAMP)
    ON CONFLICT (department, product_id)
    DO UPDATE SET
      quantity = department_inventory.quantity + $3,
      updated_at = CURRENT_TIMESTAMP
    `,
    [targetDepartment, stockProductId, delta, stockUnit]
  );

  const txType = isRestore ? "pos_void" : "pos_sale";
  const txNotes = isRestore
    ? `POS Item Void - Order #${orderNumber || orderId}: ${quantity}x ${product.name} restored (${effectiveQty} ${stockUnit} to ${targetDepartment}) ${reason ? `[${reason}]` : ""}`
    : `POS Sale - Order #${orderNumber || orderId}: ${quantity}x ${product.name} (${effectiveQty} ${stockUnit} deducted from ${targetDepartment})`;

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
    VALUES ($1, $2, $3, $4, 'order', $5, $6, $7)
    `,
    [
      targetDepartment,
      stockProductId,
      txType,
      Math.abs(effectiveQty),
      orderId,
      txNotes,
      userId || null,
    ]
  );
};

// ============================================================
// HELPER: RECALCULATE ORDER TOTALS
// ============================================================

const recalculateOrderTotals = async (client, orderId) => {
  const subtotalRes = await client.query(
    `SELECT COALESCE(SUM(total), 0) AS subtotal FROM order_items WHERE order_id = $1 AND status != 'cancelled'`,
    [orderId]
  );
  const subtotal = Number(parseFloat(subtotalRes.rows[0].subtotal || 0).toFixed(2));
  const vat = Number((subtotal * 0.15).toFixed(2));
  const serviceCharge = Number((subtotal * 0.10).toFixed(2));
  const tax = Number((vat + serviceCharge).toFixed(2));

  const orderCheck = await client.query(`SELECT discount FROM orders WHERE id = $1`, [orderId]);
  const discount = Number(orderCheck.rows[0]?.discount || 0);
  const total = Number(Math.max(0, subtotal - discount + tax).toFixed(2));

  await client.query(
    `UPDATE orders
     SET subtotal = $1, tax = $2, total = $3, updated_at = CURRENT_TIMESTAMP
     WHERE id = $4`,
    [subtotal, tax, total, orderId]
  );
};

// ============================================================
// ADD ITEMS TO EXISTING ORDER (FOOD & BAR)
// ============================================================

const addOrderItems = async (orderId, newItems = [], user = null) => {
  if (!Array.isArray(newItems) || newItems.length === 0) {
    throw new Error("Items array is required and must not be empty");
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const orderRes = await client.query(
      `SELECT * FROM orders WHERE id::text = $1 OR order_number = $1 FOR UPDATE`,
      [String(orderId).trim()]
    );
    if (orderRes.rows.length === 0) {
      throw new Error("Order not found");
    }
    const order = orderRes.rows[0];

    if (order.status === "completed" || order.status === "cancelled") {
      throw new Error(`Cannot add items to an order that is already ${order.status}`);
    }
    if (order.payment_status === "paid") {
      throw new Error("Cannot add items to an order that is already fully paid and settled");
    }

    const kitchenItems = [];
    const barItems = [];

    for (const item of newItems) {
      const rawId = item.productId || item.product_id;
      const cleanProductId = typeof rawId === "string" && rawId.includes("_")
        ? parseInt(rawId.split("_")[0], 10)
        : parseInt(rawId, 10);

      const productResult = await client.query(
        `SELECT p.*, pc.type AS category_type
         FROM products p
         LEFT JOIN product_categories pc ON p.category_id = pc.id
         WHERE p.id = $1`,
        [cleanProductId]
      );
      if (productResult.rows.length === 0) {
        throw new Error(`Product with ID ${cleanProductId || rawId} not found`);
      }
      const product = productResult.rows[0];
      const unitPrice = Number(item.price || item.unitPrice || item.unit_price || product.price || 0);
      const quantity = Number(item.quantity || 0);
      if (quantity <= 0) {
        throw new Error(`Invalid quantity for product ${product.name}`);
      }
      const itemTotal = Number((quantity * unitPrice).toFixed(2));

      const itemResult = await client.query(
        `INSERT INTO order_items (order_id, product_id, quantity, unit_price, total, notes, status)
         VALUES ($1, $2, $3, $4, $5, $6, 'pending')
         RETURNING *`,
        [order.id, product.id, quantity, unitPrice, itemTotal, item.notes || null]
      );
      const createdItem = itemResult.rows[0];

      const categoryType = product.category_type?.toLowerCase();
      let targetDept = null;
      if (categoryType === "food") {
        targetDept = "kitchen";
        kitchenItems.push(createdItem);
      } else if (categoryType === "beverage" || categoryType === "bar") {
        targetDept = "bar";
        barItems.push(createdItem);
      }

      await adjustDepartmentStock(
        client,
        product,
        quantity,
        targetDept,
        order.id,
        order.order_number,
        user?.id,
        false
      );
    }

    // Dispatch Kitchen items
    if (kitchenItems.length > 0) {
      const existingKo = await client.query(
        `SELECT id FROM kitchen_orders WHERE order_id = $1 AND status != 'ready' AND status != 'served' ORDER BY id DESC LIMIT 1`,
        [order.id]
      );
      let kitchenOrderId = existingKo.rows[0]?.id;
      if (!kitchenOrderId) {
        const newKo = await client.query(
          `INSERT INTO kitchen_orders (order_id, status) VALUES ($1, 'pending') RETURNING id`,
          [order.id]
        );
        kitchenOrderId = newKo.rows[0].id;
      }
      for (const ki of kitchenItems) {
        await client.query(
          `INSERT INTO kitchen_order_items (kitchen_order_id, order_item_id, quantity, status)
           VALUES ($1, $2, $3, 'pending')`,
          [kitchenOrderId, ki.id, ki.quantity]
        );
      }
    }

    // Dispatch Bar items
    if (barItems.length > 0) {
      const existingBo = await client.query(
        `SELECT id FROM bar_orders WHERE order_id = $1 AND status != 'ready' AND status != 'served' ORDER BY id DESC LIMIT 1`,
        [order.id]
      );
      let barOrderId = existingBo.rows[0]?.id;
      if (!barOrderId) {
        const newBo = await client.query(
          `INSERT INTO bar_orders (order_id, status) VALUES ($1, 'pending') RETURNING id`,
          [order.id]
        );
        barOrderId = newBo.rows[0].id;
      }
      for (const bi of barItems) {
        await client.query(
          `INSERT INTO bar_order_items (bar_order_id, order_item_id, quantity, status)
           VALUES ($1, $2, $3, 'pending')`,
          [barOrderId, bi.id, bi.quantity]
        );
      }
    }

    // Recalculate order totals
    await recalculateOrderTotals(client, order.id);

    await client.query("COMMIT");
    return await getOrderById(order.id);
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
};

// ============================================================
// REMOVE / VOID ORDER ITEM (REVERSES KITCHEN/BAR & RESTORES STOCK)
// ============================================================

const removeOrderItem = async (orderId, orderItemId, options = {}, user = null) => {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const itemRes = await client.query(
      `SELECT oi.*, o.status AS order_status, o.payment_status, o.order_number
       FROM order_items oi
       JOIN orders o ON oi.order_id = o.id
       WHERE oi.id = $1 AND (o.id::text = $2 OR o.order_number = $2)
       FOR UPDATE OF oi`,
      [Number(orderItemId), String(orderId).trim()]
    );
    if (itemRes.rows.length === 0) {
      throw new Error("Order item not found on this order");
    }
    const item = itemRes.rows[0];

    if (item.payment_status === "paid") {
      throw new Error("Cannot void an item on an already settled order");
    }
    if (item.order_status === "completed") {
      throw new Error("Cannot void an item on a completed order");
    }

    // Get product details to restore stock
    const prodRes = await client.query(
      `SELECT p.*, pc.type AS category_type
       FROM products p
       LEFT JOIN product_categories pc ON p.category_id = pc.id
       WHERE p.id = $1`,
      [item.product_id]
    );
    if (prodRes.rows.length > 0) {
      const product = prodRes.rows[0];
      const categoryType = product.category_type?.toLowerCase();
      let targetDept = null;
      if (categoryType === "food") targetDept = "kitchen";
      else if (categoryType === "beverage" || categoryType === "bar") targetDept = "bar";

      await adjustDepartmentStock(
        client,
        product,
        item.quantity,
        targetDept,
        item.order_id,
        item.order_number,
        user?.id,
        true,
        options.reason || "Customer changed order"
      );
    }

    // Remove from kitchen_order_items and bar_order_items
    await client.query(`DELETE FROM kitchen_order_items WHERE order_item_id = $1`, [item.id]);
    await client.query(`DELETE FROM bar_order_items WHERE order_item_id = $1`, [item.id]);

    // Delete order_item
    await client.query(`DELETE FROM order_items WHERE id = $1`, [item.id]);

    // Recalculate order totals
    await recalculateOrderTotals(client, item.order_id);

    await client.query("COMMIT");
    return await getOrderById(item.order_id);
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
};

// ============================================================
// UPDATE ORDER ITEM (QUANTITY / NOTES)
// ============================================================

const updateOrderItem = async (orderId, orderItemId, updateData = {}, user = null) => {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const itemRes = await client.query(
      `SELECT oi.*, o.status AS order_status, o.payment_status, o.order_number
       FROM order_items oi
       JOIN orders o ON oi.order_id = o.id
       WHERE oi.id = $1 AND (o.id::text = $2 OR o.order_number = $2)
       FOR UPDATE OF oi`,
      [Number(orderItemId), String(orderId).trim()]
    );
    if (itemRes.rows.length === 0) {
      throw new Error("Order item not found on this order");
    }
    const item = itemRes.rows[0];

    if (item.payment_status === "paid") {
      throw new Error("Cannot modify an item on an already settled order");
    }
    if (item.order_status === "completed" || item.order_status === "cancelled") {
      throw new Error(`Cannot modify an item on a ${item.order_status} order`);
    }

    const oldQty = Number(item.quantity);
    const newQty = updateData.quantity !== undefined ? Number(updateData.quantity) : oldQty;
    const newNotes = updateData.notes !== undefined ? updateData.notes : item.notes;

    if (newQty <= 0) {
      throw new Error("Quantity must be greater than zero. To remove an item, use the void/delete endpoint.");
    }

    const diff = newQty - oldQty;
    if (diff !== 0) {
      const prodRes = await client.query(
        `SELECT p.*, pc.type AS category_type
         FROM products p
         LEFT JOIN product_categories pc ON p.category_id = pc.id
         WHERE p.id = $1`,
        [item.product_id]
      );
      if (prodRes.rows.length > 0) {
        const product = prodRes.rows[0];
        const categoryType = product.category_type?.toLowerCase();
        let targetDept = null;
        if (categoryType === "food") targetDept = "kitchen";
        else if (categoryType === "beverage" || categoryType === "bar") targetDept = "bar";

        if (diff > 0) {
          await adjustDepartmentStock(
            client,
            product,
            diff,
            targetDept,
            item.order_id,
            item.order_number,
            user?.id,
            false
          );
        } else {
          await adjustDepartmentStock(
            client,
            product,
            Math.abs(diff),
            targetDept,
            item.order_id,
            item.order_number,
            user?.id,
            true,
            "Quantity reduced"
          );
        }
      }
    }

    const newTotal = Number((newQty * Number(item.unit_price)).toFixed(2));
    await client.query(
      `UPDATE order_items
       SET quantity = $1, total = $2, notes = $3
       WHERE id = $4`,
      [newQty, newTotal, newNotes, item.id]
    );

    // Sync kitchen / bar items
    await client.query(
      `UPDATE kitchen_order_items SET quantity = $1 WHERE order_item_id = $2`,
      [newQty, item.id]
    );
    await client.query(
      `UPDATE bar_order_items SET quantity = $1 WHERE order_item_id = $2`,
      [newQty, item.id]
    );

    // Recalculate order totals
    await recalculateOrderTotals(client, item.order_id);

    await client.query("COMMIT");
    return await getOrderById(item.order_id);
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
};

// ============================================================
// EXPORTS
// ============================================================

module.exports = {
  getAllOrders,
  getOrderById,
  createOrder,
  updateOrderStatus,
  addOrderItems,
  removeOrderItem,
  updateOrderItem,
  createPayment,

  getAllTables,
  createTable,
  updateTable,
  updateTableStatus,
  deleteTable,
};
