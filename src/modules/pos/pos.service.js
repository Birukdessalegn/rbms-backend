const pool = require("../../config/database");
const notificationsService = require("../notifications/notifications.service");

// ============================================================
// RESOLVE TARGET DEPARTMENT (KITCHEN vs BAR)
// ============================================================
const resolveTargetDepartment = (product) => {
  if (!product) return null;
  const categoryType = (product.category_type || "").toLowerCase().trim();
  const categoryName = (product.category_name || "").toLowerCase().trim();
  const productName = (product.name || "").toLowerCase().trim();
  const tags = (product.tags || "").toLowerCase().trim();

  // Fruit Items (Deduct Fruit sub-store stock & ticket to Fruit/Kitchen prep queue)
  if (
    categoryType === "fruit" ||
    categoryName.includes("fruit") ||
    productName.includes("fruit") ||
    tags.includes("fruit")
  ) {
    return "fruit";
  }

  // Kitchen / Food Items (Ticket to Kitchen & deduct Kitchen stock)
  if (
    categoryType === "food" ||
    categoryType === "kitchen" ||
    categoryName.includes("food") ||
    categoryName.includes("kitchen") ||
    categoryName.includes("salad") ||
    categoryName.includes("dessert") ||
    categoryName.includes("appetizer") ||
    categoryName.includes("bakery") ||
    categoryName.includes("meal") ||
    productName.includes("salad") ||
    productName.includes("pizza") ||
    productName.includes("burger")
  ) {
    return "kitchen";
  }

  // Bar / Drink Items (Ticket to Bar & deduct Bar stock)
  if (
    categoryType === "bar" ||
    categoryType === "beverage" ||
    categoryType === "drink" ||
    categoryName.includes("bar") ||
    categoryName.includes("drink") ||
    categoryName.includes("beverage") ||
    categoryName.includes("wine") ||
    categoryName.includes("beer") ||
    categoryName.includes("cocktail") ||
    categoryName.includes("liquor") ||
    categoryName.includes("spirit") ||
    categoryName.includes("whiskey") ||
    categoryName.includes("vodka") ||
    categoryName.includes("gin") ||
    categoryName.includes("juice") ||
    categoryName.includes("soda") ||
    categoryName.includes("coffee") ||
    categoryName.includes("tea")
  ) {
    return "bar";
  }

  return null;
};

// ============================================================
// GET ALL POS ORDERS
// ============================================================

const getAllOrders = async (waiterUserId = null) => {
  let whereClause = "";
  const params = [];

  if (waiterUserId) {
    const isUUID =
      typeof waiterUserId === "string" &&
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(waiterUserId).trim());

    if (isUUID) {
      params.push(String(waiterUserId).trim());
      whereClause = "WHERE (e.user_id = $1 OR o.waiter_id IN (SELECT id FROM employees WHERE user_id = $1))";
    }
  }

  const result = await pool.query(`
    SELECT
      o.id,
      o.order_number,
      o.customer_id,
      o.vip_customer_id,
      vc.name AS vip_customer_name,
      vc.tier AS vip_customer_tier,
      vc.phone AS vip_customer_phone,
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

      e.id AS waiter_employee_id,
      e.user_id AS waiter_user_id,
      u.username AS waiter_username,
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

    LEFT JOIN vip_customers vc
      ON o.vip_customer_id = vc.id

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

    ${whereClause}

    ORDER BY o.created_at DESC
  `, params);

  const orders = result.rows;

  if (orders.length > 0) {
    const orderIds = orders.map((o) => o.id);
    const paymentsResult = await pool.query(
      `
      SELECT
        p.id,
        p.order_id,
        p.amount,
        p.payment_method,
        p.reference,
        p.status,
        p.paid_at,
        p.split_items,
        p.vip_customer_id,
        vcp.name AS vip_customer_name,
        vcp.tier AS vip_customer_tier,
        vcp.phone AS vip_customer_phone,
        COALESCE(p.receipt_image, p.image_url) AS image_url,
        COALESCE(p.receipt_image, p.image_url) AS receipt_image,
        COALESCE(p.receipt_image, p.image_url) AS receipt_url,
        (COALESCE(p.receipt_image, p.image_url) IS NOT NULL) AS has_receipt
      FROM payments p
      LEFT JOIN vip_customers vcp
        ON p.vip_customer_id = vcp.id
      WHERE p.order_id = ANY($1::int[])
      ORDER BY p.paid_at DESC
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

    // Fetch order items with product details for all orders
    const itemsResult = await pool.query(
      `
      SELECT
        oi.id,
        oi.order_id,
        oi.product_id,
        oi.quantity,
        COALESCE(oi.paid_quantity, 0) AS paid_quantity,
        oi.unit_price,
        oi.discount,
        oi.total,
        oi.notes,
        oi.status,
        p.name AS product_name,
        p.unit,
        p.shots_capacity,
        p.is_shot_item,
        p.double_shot_price,
        p.half_bottle_price,
        p.bottle_price,
        COALESCE(p.allow_single_shot, TRUE) AS allow_single_shot,
        COALESCE(p.allow_double_shot, TRUE) AS allow_double_shot,
        COALESCE(p.allow_half_bottle, TRUE) AS allow_half_bottle,
        COALESCE(p.allow_full_bottle, TRUE) AS allow_full_bottle,
        p.portion_ratio,
        p.serving_size,
        pc.name AS category_name,
        pc.type AS category_type
      FROM order_items oi
      JOIN products p ON oi.product_id = p.id
      LEFT JOIN product_categories pc ON p.category_id = pc.id
      WHERE oi.order_id = ANY($1::int[])
      ORDER BY oi.id ASC
      `,
      [orderIds]
    );

    const itemsByOrderId = {};
    for (const item of itemsResult.rows) {
      if (!itemsByOrderId[item.order_id]) {
        itemsByOrderId[item.order_id] = [];
      }
      itemsByOrderId[item.order_id].push(item);
    }

    for (const order of orders) {
      order.payments = paymentsByOrderId[order.id] || [];
      order.items = itemsByOrderId[order.id] || [];

      // Populate primary payment method from payments ledger
      if (order.payments.length > 0) {
        order.payment_method = order.payments[0].payment_method;
      } else if (order.payment_status === "credit_approved" || order.payment_status === "credit_pending") {
        order.payment_method = "credit";
      } else {
        order.payment_method = "cash";
      }

      if (!order.vip_customer_name) {
        const vipPayment = order.payments.find((p) => p.vip_customer_name);
        if (vipPayment) {
          order.vip_customer_name = vipPayment.vip_customer_name;
          order.vip_customer_tier = vipPayment.vip_customer_tier;
          order.vip_customer_phone = vipPayment.vip_customer_phone;
          order.vip_customer_id = vipPayment.vip_customer_id;
        }
      }
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
      o.vip_customer_id,
      vc.name AS vip_customer_name,
      vc.tier AS vip_customer_tier,
      vc.phone AS vip_customer_phone,
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

      e.id AS waiter_employee_id,
      e.user_id AS waiter_user_id,
      u.username AS waiter_username,
      e.first_name AS waiter_first_name,
      e.last_name AS waiter_last_name,
      COALESCE(e.first_name || ' ' || e.last_name, u.username) AS waiter_name,

      eb.first_name AS bartender_first_name,
      eb.last_name AS bartender_last_name,
      COALESCE(eb.first_name || ' ' || eb.last_name, ub.username) AS bartender_name

    FROM orders o

    LEFT JOIN vip_customers vc
      ON o.vip_customer_id = vc.id

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
      COALESCE(oi.paid_quantity, 0) AS paid_quantity,
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
      p.id,
      p.amount,
      p.payment_method,
      p.reference,
      p.status,
      p.paid_at,
      p.split_items,
      p.vip_customer_id,
      vcp.name AS vip_customer_name,
      vcp.tier AS vip_customer_tier,
      vcp.phone AS vip_customer_phone,
      COALESCE(p.receipt_image, p.image_url) AS image_url,
      COALESCE(p.receipt_image, p.image_url) AS receipt_image,
      COALESCE(p.receipt_image, p.image_url) AS receipt_url,
      (COALESCE(p.receipt_image, p.image_url) IS NOT NULL) AS has_receipt
    FROM payments p
    LEFT JOIN vip_customers vcp
      ON p.vip_customer_id = vcp.id
    WHERE p.order_id = $1
    ORDER BY p.paid_at DESC
    `,
    [order.id]
  );

  order.payments = paymentsResult.rows;

  if (order.payments.length > 0) {
    order.payment_method = order.payments[0].payment_method;
  } else if (order.payment_status === "credit_approved" || order.payment_status === "credit_pending") {
    order.payment_method = "credit";
  } else {
    order.payment_method = "cash";
  }

  if (!order.vip_customer_name) {
    const vipPayment = order.payments.find((p) => p.vip_customer_name);
    if (vipPayment) {
      order.vip_customer_name = vipPayment.vip_customer_name;
      order.vip_customer_tier = vipPayment.vip_customer_tier;
      order.vip_customer_phone = vipPayment.vip_customer_phone;
      order.vip_customer_id = vipPayment.vip_customer_id;
    }
  }

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
    // FIND EMPLOYEE USING LOGGED-IN USER ID OR DIRECT EMPLOYEE ID
    // ============================================================

    let employeeId = null;

    const isUUID = (val) =>
      typeof val === "string" &&
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(val.trim());

    if (waiterId) {
      let employeeResult = null;
      if (isUUID(waiterId)) {
        employeeResult = await client.query(
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
      } else if (Number.isInteger(Number(waiterId)) && Number(waiterId) > 0) {
        employeeResult = await client.query(
          `
          SELECT
            id,
            first_name,
            last_name,
            role_id,
            user_id
          FROM employees
          WHERE id = $1
          LIMIT 1
          `,
          [Number(waiterId)]
        );
      }

      if (employeeResult && employeeResult.rows.length > 0) {
        employeeId = employeeResult.rows[0].id;
      } else if (Number.isInteger(Number(waiterId)) && Number(waiterId) > 0) {
        employeeId = Number(waiterId);
      }
    }

    // Fallback to order.user if employeeId was not resolved from waiterId
    if (!employeeId && order.user) {
      const fallbackUserId = order.user.employee_id || order.user.employeeId || order.user.id || order.user.user_id;
      if (fallbackUserId) {
        let empRes = null;
        if (isUUID(fallbackUserId)) {
          empRes = await client.query(
            `SELECT id FROM employees WHERE user_id = $1 LIMIT 1`,
            [fallbackUserId]
          );
        } else if (Number.isInteger(Number(fallbackUserId)) && Number(fallbackUserId) > 0) {
          empRes = await client.query(
            `SELECT id FROM employees WHERE id = $1 LIMIT 1`,
            [Number(fallbackUserId)]
          );
        }

        if (empRes && empRes.rows.length > 0) {
          employeeId = empRes.rows[0].id;
        } else if (Number.isInteger(Number(fallbackUserId)) && Number(fallbackUserId) > 0) {
          employeeId = Number(fallbackUserId);
        }
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
          isBartenderRole;

        // Bar tables and counter seats are reserved exclusively for the Bartender
        if (targetTable.is_bar_seat && !isBartenderRole && !isElevatedRole) {
          throw new Error(
            `Table ${targetTable.table_number} is a bar table reserved for the Bartender.`
          );
        }

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
            p.double_shot_price,
            p.half_bottle_price,
            p.bottle_price,
            COALESCE(p.allow_single_shot, TRUE) AS allow_single_shot,
            COALESCE(p.allow_double_shot, TRUE) AS allow_double_shot,
            COALESCE(p.allow_half_bottle, TRUE) AS allow_half_bottle,
            COALESCE(p.allow_full_bottle, TRUE) AS allow_full_bottle,
            COALESCE(p.tags, '') AS tags,
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

        const targetDepartment = resolveTargetDepartment(product);

        // Kitchen & Fruit Products (Dispatch prep ticket to kitchen/fruit station)
        if (targetDepartment === "kitchen" || targetDepartment === "fruit") {
          kitchenItems.push(createdItem);
        }
        // Bar Products
        else if (targetDepartment === "bar") {
          barItems.push(createdItem);
        }
        else {
          console.log(
            `Product "${product.name}" (category: "${product.category_name || ""}", type: "${product.category_type || ""}") is not sent to kitchen or bar.`
          );
        }

        // ========================================================
        // AUTOMATIC STOCK DEDUCTION FROM BAR / KITCHEN SUB-STORE
        // WITH PARENT-PRODUCT PORTION CONVERSION (SHOTS / HALF BOTTLE)
        // ========================================================

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
              productId: stockProductId,
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

    // Product prices in database are customer menu prices (inclusive of 15% VAT)
    // Total is the registered product price sum minus any discount - no extra tax added on top
    const calculatedTotal = Number(
      Math.max(calculatedSubtotal - calculatedDiscount, 0).toFixed(2)
    );

    // 15% VAT included in customer menu price (Ethiopian standard: Price - Price / 1.15)
    const calculatedTax = Number(
      (calculatedTotal - (calculatedTotal / 1.15)).toFixed(2)
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
      const targetRoles = ["admin", "manager", "fb_controller", "storekeeper"];
      if (alert.department === "bar" && !targetRoles.includes("bartender")) targetRoles.push("bartender");
      if (alert.department === "kitchen" && !targetRoles.includes("chef")) targetRoles.push("chef");
      if (alert.department === "fruit" && !targetRoles.includes("fruit_manager")) targetRoles.push("fruit_manager");

      notificationsService.createNotification({
        targetRoles,
        title: `${alert.department.toUpperCase()} Low Stock Alert`,
        message: `"${alert.productName}" in ${alert.department.toUpperCase()} is running low (${alert.remaining} remaining, minimum: ${alert.min}). F&B restock required!`,
        type: "warning",
        referenceType: "department_low_stock",
        referenceId: alert.productId || null,
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

const updateOrderStatus = async (id, status, userId = null, reason = "") => {
  const cleanId = String(id).replace(/^#/, "").trim();

  // If status is NOT cancelled, perform standard update
  if (status !== "cancelled") {
    const result = await pool.query(
      `
      UPDATE orders
      SET
        status = $1,
        updated_at = CURRENT_TIMESTAMP
      WHERE id::text = $2 OR order_number = $2 OR order_number = $3 OR ('#' || order_number) = $2
      RETURNING *
      `,
      [status, String(id).trim(), cleanId]
    );

    return result.rows[0] || null;
  }

  // ============================================================
  // STATUS === 'cancelled': FULL REVERSAL & STOCK RESTORATION
  // ============================================================
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // 1. Lock and fetch order
    const orderRes = await client.query(
      `SELECT * FROM orders 
       WHERE id::text = $1 OR order_number = $1 OR order_number = $2 OR ('#' || order_number) = $1
       FOR UPDATE`,
      [String(id).trim(), cleanId]
    );

    if (orderRes.rows.length === 0) {
      await client.query("ROLLBACK");
      return null;
    }

    const order = orderRes.rows[0];

    // If already cancelled, do not duplicate stock restoration
    if (order.status === "cancelled") {
      await client.query("COMMIT");
      return order;
    }

    if (order.payment_status === "paid" || order.status === "completed") {
      throw new Error("Cannot cancel a completed or settled order");
    }

    // 2. Fetch all active order items with product and category info
    const itemsRes = await client.query(
      `SELECT oi.*, 
              p.id AS p_id, p.name AS p_name, p.unit AS p_unit, 
              p.parent_product_id, p.portion_ratio, p.shots_capacity,
              COALESCE(p.tags, '') AS tags,
              pc.type AS category_type, pc.name AS category_name
       FROM order_items oi
       JOIN products p ON oi.product_id = p.id
       LEFT JOIN product_categories pc ON p.category_id = pc.id
       WHERE oi.order_id = $1 AND (oi.status IS NULL OR oi.status != 'cancelled')`,
      [order.id]
    );

    // 3. Restore stock for each item back to its department sub-store
    for (const item of itemsRes.rows) {
      const product = {
        id: item.p_id,
        name: item.p_name,
        unit: item.p_unit,
        parent_product_id: item.parent_product_id,
        portion_ratio: item.portion_ratio,
        shots_capacity: item.shots_capacity,
        category_type: item.category_type,
        category_name: item.category_name,
        tags: item.tags,
      };

      const targetDept = resolveTargetDepartment(product);

      await adjustDepartmentStock(
        client,
        product,
        item.quantity,
        targetDept,
        order.id,
        order.order_number,
        userId,
        true, // isRestore = true!
        reason || "Order cancelled"
      );
    }

    // 4. Mark all order items as cancelled
    await client.query(
      `UPDATE order_items SET status = 'cancelled' WHERE order_id = $1`,
      [order.id]
    );

    // 5. Cancel kitchen and bar tickets and items
    await client.query(
      `UPDATE kitchen_orders SET status = 'cancelled' WHERE order_id = $1 AND status != 'served'`,
      [order.id]
    );
    await client.query(
      `UPDATE kitchen_order_items SET status = 'cancelled' 
       WHERE kitchen_order_id IN (SELECT id FROM kitchen_orders WHERE order_id = $1)`,
      [order.id]
    );
    await client.query(
      `UPDATE bar_orders SET status = 'cancelled' WHERE order_id = $1 AND status != 'served'`,
      [order.id]
    );
    await client.query(
      `UPDATE bar_order_items SET status = 'cancelled' 
       WHERE bar_order_id IN (SELECT id FROM bar_orders WHERE order_id = $1)`,
      [order.id]
    );

    // 6. Free table if no other active orders occupy it
    if (order.table_id) {
      const otherOrders = await client.query(
        `SELECT id FROM orders 
         WHERE table_id = $1 AND id != $2 AND status NOT IN ('completed', 'cancelled')
         LIMIT 1`,
        [order.table_id, order.id]
      );
      if (otherOrders.rows.length === 0) {
        await client.query(
          `UPDATE restaurant_tables 
           SET status = 'available', current_waiter_id = NULL 
           WHERE id = $1`,
          [order.table_id]
        );
      }
    }

    // 7. Update the order record to cancelled with 0 totals
    const updateRes = await client.query(
      `UPDATE orders
       SET status = 'cancelled',
           subtotal = 0,
           tax = 0,
           total = 0,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $1
       RETURNING *`,
      [order.id]
    );

    await client.query("COMMIT");
    return updateRes.rows[0] || null;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
};


const createPayment = async (orderId, data) => {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const { amount, paymentMethod, reference, receivedBy, status, vipCustomerId, vip_customer_id, customerId, customerName, customer_name } = data;
    let targetVipId = vipCustomerId || vip_customer_id || customerId || null;

    if (!targetVipId && (customerName || customer_name)) {
      const cName = String(customerName || customer_name).trim();
      if (cName) {
        const foundVip = await client.query(
          `SELECT id FROM vip_customers WHERE LOWER(TRIM(name)) = LOWER($1) AND is_active = TRUE LIMIT 1`,
          [cName]
        );
        if (foundVip.rows.length > 0) {
          targetVipId = foundVip.rows[0].id;
        }
      }
    }

    if (!targetVipId && reference && String(reference).startsWith("VIP_CREDIT:")) {
      const parsedName = String(reference).replace("VIP_CREDIT:", "").trim();
      if (parsedName) {
        const foundVip = await client.query(
          `SELECT id FROM vip_customers WHERE LOWER(TRIM(name)) = LOWER($1) AND is_active = TRUE LIMIT 1`,
          [parsedName]
        );
        if (foundVip.rows.length > 0) {
          targetVipId = foundVip.rows[0].id;
        }
      }
    }

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

    const splitList = Array.isArray(data.splitItems)
      ? data.splitItems
      : (Array.isArray(data.split_items) ? data.split_items : null);
    const splitJson = splitList && splitList.length > 0 ? JSON.stringify(splitList) : null;

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
        split_items,
        paid_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $7, $8, $9, $10, CURRENT_TIMESTAMP)
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
        splitJson,
      ]
    );

    if (targetVipId) {
      await client.query(
        `UPDATE orders SET vip_customer_id = $1 WHERE id = $2`,
        [targetVipId, realNumericDbId]
      );
    }

    // Update item-level paid quantities if specific split items were paid
    if (splitList && splitList.length > 0) {
      for (const sItem of splitList) {
        const itemId = sItem.id || sItem.order_item_id || sItem.orderItemId || sItem.item_id;
        const qtyPaid = Number(sItem.selectedQuantity ?? sItem.quantity ?? sItem.qty ?? 0);
        if (itemId && qtyPaid > 0) {
          await client.query(
            `UPDATE order_items
             SET paid_quantity = LEAST(quantity, COALESCE(paid_quantity, 0) + $1)
             WHERE id = $2 AND order_id = $3`,
            [qtyPaid, itemId, realNumericDbId]
          );
        }
      }
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

    // If order is fully paid, ensure all order items are marked 100% paid
    if (isFullyPaid) {
      await client.query(
        `UPDATE order_items SET paid_quantity = quantity WHERE order_id = $1`,
        [realNumericDbId]
      );
    }

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
      splitItems: splitList,
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
  let resolvedWaiterId = null;

  if (waiterId !== null && waiterId !== undefined) {
    const isUUID =
      typeof waiterId === "string" &&
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(waiterId).trim());

    if (isUUID) {
      const empRes = await pool.query(
        "SELECT id FROM employees WHERE user_id = $1 LIMIT 1",
        [String(waiterId).trim()]
      );
      if (empRes.rows.length > 0) {
        resolvedWaiterId = empRes.rows[0].id;
      }
    } else if (Number.isInteger(Number(waiterId)) && Number(waiterId) > 0) {
      const empRes = await pool.query(
        "SELECT id FROM employees WHERE id = $1 LIMIT 1",
        [Number(waiterId)]
      );
      if (empRes.rows.length > 0) {
        resolvedWaiterId = empRes.rows[0].id;
      }
    }
  }

  const numericId = Number.isInteger(Number(id)) && Number(id) > 0 ? Number(id) : null;
  const tableNum = String(id || "").trim();

  const result = await pool.query(
    `
    UPDATE restaurant_tables
    SET
      status = $1::varchar,
      current_waiter_id = CASE
        WHEN $1::varchar = 'available' THEN NULL
        WHEN $2::integer IS NOT NULL THEN $2::integer
        ELSE current_waiter_id
      END
    WHERE ($3::integer IS NOT NULL AND id = $3::integer) OR table_number = $4::varchar
    RETURNING *
    `,
    [status, resolvedWaiterId, numericId, tableNum]
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

async function adjustDepartmentStock(
  client,
  product,
  quantity,
  targetDepartment,
  orderId,
  orderNumber,
  userId,
  isRestore = false,
  reason = "",
  shotsDeduction = null
) {
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
  } else if (shotsDeduction) {
    const bottleCapacity = Number(product.shots_capacity) > 0 ? Number(product.shots_capacity) : 30;
    const ratio = Number(shotsDeduction) / bottleCapacity;
    effectiveQty = Number((quantity * ratio).toFixed(4));
    stockUnit = "bottle (portions)";
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
    `SELECT COALESCE(SUM(total), 0) AS subtotal, COUNT(*) AS active_count 
     FROM order_items WHERE order_id = $1 AND status != 'cancelled'`,
    [orderId]
  );
  const subtotal = Number(parseFloat(subtotalRes.rows[0].subtotal || 0).toFixed(2));
  const activeCount = parseInt(subtotalRes.rows[0]?.active_count || 0, 10);
  const orderCheck = await client.query(`SELECT table_id, discount, status FROM orders WHERE id = $1`, [orderId]);
  const orderData = orderCheck.rows[0];
  const discount = Number(orderData?.discount || 0);
  const total = Number(Math.max(0, subtotal - discount).toFixed(2));

  // 15% VAT included in customer menu price (Ethiopian standard: Price - Price / 1.15)
  const tax = Number((total - (total / 1.15)).toFixed(2));

  if (activeCount === 0) {
    // All items removed: cancel order, kitchen/bar tickets, and free table
    await client.query(
      `UPDATE orders
       SET subtotal = 0, tax = 0, total = 0, status = 'cancelled', updated_at = CURRENT_TIMESTAMP
       WHERE id = $1`,
      [orderId]
    );

    await client.query(
      `UPDATE kitchen_orders SET status = 'cancelled' WHERE order_id = $1 AND status != 'served'`,
      [orderId]
    );
    await client.query(
      `UPDATE bar_orders SET status = 'cancelled' WHERE order_id = $1 AND status != 'served'`,
      [orderId]
    );

    if (orderData?.table_id) {
      const otherOrders = await client.query(
        `SELECT id FROM orders 
         WHERE table_id = $1 AND id != $2 AND status NOT IN ('completed', 'cancelled')
         LIMIT 1`,
        [orderData.table_id, orderId]
      );
      if (otherOrders.rows.length === 0) {
        await client.query(
          `UPDATE restaurant_tables 
           SET status = 'available', current_waiter_id = NULL 
           WHERE id = $1`,
          [orderData.table_id]
        );
      }
    }
  } else {
    await client.query(
      `UPDATE orders
       SET subtotal = $1, tax = $2, total = $3, updated_at = CURRENT_TIMESTAMP
       WHERE id = $4`,
      [subtotal, tax, total, orderId]
    );
  }
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

    const cleanOrderId = String(orderId).replace(/^#/, "").trim();
    const orderRes = await client.query(
      `SELECT * FROM orders WHERE id::text = $1 OR order_number = $1 OR order_number = $2 OR ('#' || order_number) = $1 FOR UPDATE`,
      [String(orderId).trim(), cleanOrderId]
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
        `SELECT p.*, pc.type AS category_type, pc.name AS category_name
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

      const targetDept = resolveTargetDepartment(product);
      if (targetDept === "kitchen" || targetDept === "fruit") {
        kitchenItems.push(createdItem);
      } else if (targetDept === "bar") {
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
        false,
        "",
        item.shotsDeduction || item.shots
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

    const cleanOrderId = String(orderId).replace(/^#/, "").trim();
    const itemRes = await client.query(
      `SELECT oi.*, o.status AS order_status, o.payment_status, o.order_number
       FROM order_items oi
       JOIN orders o ON oi.order_id = o.id
       WHERE oi.id = $1 AND (o.id::text = $2 OR o.order_number = $2 OR o.order_number = $3 OR ('#' || o.order_number) = $2)
       FOR UPDATE OF oi`,
      [Number(orderItemId), String(orderId).trim(), cleanOrderId]
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
      `SELECT p.*, pc.type AS category_type, pc.name AS category_name
       FROM products p
       LEFT JOIN product_categories pc ON p.category_id = pc.id
       WHERE p.id = $1`,
      [item.product_id]
    );
    if (prodRes.rows.length > 0) {
      const product = prodRes.rows[0];
      const targetDept = resolveTargetDepartment(product);

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

    const cleanOrderId = String(orderId).replace(/^#/, "").trim();
    const itemRes = await client.query(
      `SELECT oi.*, o.status AS order_status, o.payment_status, o.order_number
       FROM order_items oi
       JOIN orders o ON oi.order_id = o.id
       WHERE oi.id = $1 AND (o.id::text = $2 OR o.order_number = $2 OR o.order_number = $3 OR ('#' || o.order_number) = $2)
       FOR UPDATE OF oi`,
      [Number(orderItemId), String(orderId).trim(), cleanOrderId]
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
        `SELECT p.*, pc.type AS category_type, pc.name AS category_name
         FROM products p
         LEFT JOIN product_categories pc ON p.category_id = pc.id
         WHERE p.id = $1`,
        [item.product_id]
      );
      if (prodRes.rows.length > 0) {
        const product = prodRes.rows[0];
        const targetDept = resolveTargetDepartment(product);

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
// CREATE STAFF MEAL ORDER (HANDLED BY CASHIER)
// ============================================================

const createStaffOrder = async (orderData = {}, user = null) => {
  const {
    employeeId,
    employeeName,
    items = [],
    paymentMethod = "cash",
    notes = "",
  } = orderData;

  if (!Array.isArray(items) || items.length === 0) {
    throw new Error("Items array is required and must contain at least 1 item");
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // 1. Resolve employee details
    let resolvedEmployeeId = null;
    let resolvedEmployeeName = employeeName || "Staff Member";

    if (employeeId) {
      const isUUIDStr = typeof employeeId === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(employeeId.trim());
      const empRes = await client.query(
        `SELECT e.id, e.first_name, e.last_name, d.name AS department 
         FROM employees e 
         LEFT JOIN departments d ON e.department_id = d.id 
         WHERE ${isUUIDStr ? "e.user_id" : "e.id"} = $1`,
        [isUUIDStr ? employeeId : Number(employeeId)]
      );
      if (empRes.rows.length > 0) {
        resolvedEmployeeId = empRes.rows[0].id;
        resolvedEmployeeName = `${empRes.rows[0].first_name} ${empRes.rows[0].last_name || ""}`.trim();
        if (empRes.rows[0].department) {
          resolvedEmployeeName += ` (${empRes.rows[0].department})`;
        }
      }
    }

    const orderNumber = `SO-${Date.now()}`;
    const cashierId = user?.id || null;

    let subtotal = 0;
    const resolvedItems = [];

    // 2. Validate items and compute staff prices
    for (const item of items) {
      const pId = item.productId || item.product_id || item.id;
      const cleanPId = typeof pId === "string" && pId.includes("_")
        ? parseInt(pId.split("_")[0], 10)
        : parseInt(pId, 10);

      const prodRes = await client.query(
        `SELECT p.*, pc.type AS category_type, pc.name AS category_name
         FROM products p
         LEFT JOIN product_categories pc ON p.category_id = pc.id
         WHERE p.id = $1`,
        [cleanPId]
      );

      if (prodRes.rows.length === 0) {
        throw new Error(`Product with ID ${cleanPId} not found`);
      }

      const product = prodRes.rows[0];

      // Strict check: item must not be customer-only
      if (product.menu_type === "customer") {
        throw new Error(`"${product.name}" is marked for Customers Only and cannot be ordered for staff.`);
      }

      const quantity = Math.max(1, Number(item.quantity || 1));
      // Staff price is used; if 0, item is free for staff
      const unitPrice = Number(product.staff_price !== null && product.staff_price !== undefined ? product.staff_price : 0);
      const itemTotal = Number((unitPrice * quantity).toFixed(2));
      subtotal += itemTotal;

      resolvedItems.push({
        product,
        quantity,
        unitPrice,
        itemTotal,
        notes: item.notes || null,
        shotsDeduction: item.shotsDeduction || null,
      });
    }

    const total = Number(subtotal.toFixed(2));
    const isPaid = paymentStatus === "paid" || total === 0 || paymentMethod === "free";
    const finalPaymentStatus = isPaid ? "paid" : "pending";
    const orderNotes = `Staff Meal: ${resolvedEmployeeName}${!isPaid ? " [UNPAID - PAYMENT PENDING]" : ""}${notes ? ` - ${notes}` : ""}`;

    // 3. Create orders record (link to employee as waiter_id)
    const orderRes = await client.query(
      `INSERT INTO orders (
        order_number,
        order_type,
        waiter_id,
        subtotal,
        discount,
        tax,
        total,
        status,
        payment_status,
        notes
      )
      VALUES ($1, 'staff', $2, $3, 0, 0, $4, 'completed', $5, $6)
      RETURNING *`,
      [
        orderNumber,
        resolvedEmployeeId || null,
        total,
        total,
        finalPaymentStatus,
        orderNotes,
      ]
    );
    const createdOrder = orderRes.rows[0];

    // 4. Record payment if paid and amount > 0
    if (isPaid && total > 0) {
      await client.query(
        `INSERT INTO payments (
          order_id,
          amount,
          payment_method,
          reference,
          status,
          paid_at,
          notes
        )
        VALUES ($1, $2, $3, $4, 'paid', CURRENT_TIMESTAMP, $5)`,
        [
          createdOrder.id,
          total,
          paymentMethod || "cash",
          `STAFF-PAY-${Date.now()}`,
          `Paid staff meal by ${resolvedEmployeeName}`,
        ]
      );
    }

    // 5. Create order_items and dispatch to kitchen/bar
    const kitchenItems = [];
    const barItems = [];

    for (const ri of resolvedItems) {
      const oiRes = await client.query(
        `INSERT INTO order_items (
          order_id,
          product_id,
          quantity,
          unit_price,
          total,
          notes,
          status
        )
        VALUES ($1, $2, $3, $4, $5, $6, 'pending')
        RETURNING *`,
        [
          createdOrder.id,
          ri.product.id,
          ri.quantity,
          ri.unitPrice,
          ri.itemTotal,
          ri.notes,
        ]
      );
      const createdItem = oiRes.rows[0];

      const targetDept = resolveTargetDepartment(ri.product);
      if (targetDept === "kitchen" || targetDept === "fruit") {
        kitchenItems.push(createdItem);
      } else if (targetDept === "bar") {
        barItems.push(createdItem);
      }

      // Deduct stock from department inventory
      await adjustDepartmentStock(
        client,
        ri.product,
        ri.quantity,
        targetDept,
        createdOrder.id,
        createdOrder.order_number,
        user?.id,
        false,
        `Staff Meal - ${resolvedEmployeeName}`,
        ri.shotsDeduction
      );
    }

    // Dispatch Kitchen Order with [STAFF MEAL] tag
    const mealTicketTag = `[STAFF MEAL: ${resolvedEmployeeName}${!isPaid ? " - UNPAID" : ""}]`;
    if (kitchenItems.length > 0) {
      const koRes = await client.query(
        `INSERT INTO kitchen_orders (order_id, notes, status)
         VALUES ($1, $2, 'pending')
         RETURNING id`,
        [createdOrder.id, mealTicketTag]
      );
      const kitchenOrderId = koRes.rows[0].id;
      for (const ki of kitchenItems) {
        await client.query(
          `INSERT INTO kitchen_order_items (kitchen_order_id, order_item_id, quantity, status)
           VALUES ($1, $2, $3, 'pending')`,
          [kitchenOrderId, ki.id, ki.quantity]
        );
      }
    }

    // Dispatch Bar Order with [STAFF MEAL] tag
    if (barItems.length > 0) {
      const boRes = await client.query(
        `INSERT INTO bar_orders (order_id, notes, status)
         VALUES ($1, $2, 'pending')
         RETURNING id`,
        [createdOrder.id, mealTicketTag]
      );
      const barOrderId = boRes.rows[0].id;
      for (const bi of barItems) {
        await client.query(
          `INSERT INTO bar_order_items (bar_order_id, order_item_id, quantity, status)
           VALUES ($1, $2, $3, 'pending')`,
          [barOrderId, bi.id, bi.quantity]
        );
      }
    }

    await client.query("COMMIT");
    return await getOrderById(createdOrder.id);
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
};

// ============================================================
// GET TODAY'S STAFF ORDERS (AUDIT & HISTORY)
// ============================================================

const getTodayStaffOrders = async () => {
  const result = await pool.query(
    `SELECT 
       o.id,
       o.order_number,
       o.subtotal,
       o.total,
       o.status,
       o.payment_status,
       o.notes,
       o.created_at,
       e.first_name AS employee_first_name,
       e.last_name AS employee_last_name,
       d.name AS employee_department,
       COALESCE(e.first_name || ' ' || e.last_name, 'Staff Member') AS employee_name,
       u.username AS cashier_name,
       COALESCE(
         (
           SELECT JSON_AGG(
             JSON_BUILD_OBJECT(
               'id', oi.id,
               'product_id', oi.product_id,
               'product_name', p.name,
               'quantity', oi.quantity,
               'unit_price', oi.unit_price,
               'total', oi.total,
               'notes', oi.notes
             )
           )
           FROM order_items oi
           JOIN products p ON oi.product_id = p.id
           WHERE oi.order_id = o.id
         ),
         '[]'::json
       ) AS items,
       COALESCE(
         (
           SELECT JSON_AGG(
             JSON_BUILD_OBJECT(
               'id', pay.id,
               'amount', pay.amount,
               'payment_method', pay.payment_method,
               'paid_at', pay.paid_at
             )
           )
           FROM payments pay
           WHERE pay.order_id = o.id AND pay.status = 'paid'
         ),
         '[]'::json
       ) AS payments
     FROM orders o
     LEFT JOIN employees e ON o.waiter_id = e.id
     LEFT JOIN departments d ON e.department_id = d.id
     LEFT JOIN users u ON e.user_id = u.id
     WHERE o.order_type = 'staff'
     ORDER BY o.created_at DESC
     LIMIT 100`
  );
  return result.rows;
};

// ============================================================
// EXPORTS
// ============================================================

module.exports = {
  getAllOrders,
  getOrderById,
  createOrder,
  createStaffOrder,
  getTodayStaffOrders,
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

