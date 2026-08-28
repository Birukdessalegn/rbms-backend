const pool = require("../../config/database");

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

      e.first_name AS waiter_first_name,
      e.last_name AS waiter_last_name

    FROM orders o

    LEFT JOIN restaurant_tables rt
      ON o.table_id = rt.id

    LEFT JOIN employees e
      ON o.waiter_id = e.id

    ORDER BY o.created_at DESC
  `);

  return result.rows;
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

      e.first_name AS waiter_first_name,
      e.last_name AS waiter_last_name

    FROM orders o

    LEFT JOIN restaurant_tables rt
      ON o.table_id = rt.id

    LEFT JOIN employees e
      ON o.waiter_id = e.id

    WHERE o.id = $1
    `,
    [id]
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
    [id]
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
      paid_at
    FROM payments
    WHERE order_id = $1
    ORDER BY paid_at DESC
    `,
    [id]
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
    tableId,
    waiterId,
    orderType,
    items,
    subtotal,
    tax,
    discount,
    total,
    notes,
  } = order;

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
    // VALIDATE & SANITIZE TABLE ID
    // ============================================================
    let validTableId = null;
    if (tableId && Number.isInteger(Number(tableId)) && Number(tableId) > 0) {
      const tableCheck = await client.query(
        `
        SELECT id
        FROM restaurant_tables
        WHERE id = $1
        LIMIT 1
        `,
        [Number(tableId)]
      );

      if (tableCheck.rows.length > 0) {
        validTableId = tableCheck.rows[0].id;
      }
    }


    // ============================================================
    // CREATE MAIN ORDER
    // ============================================================

    const result = await client.query(
      `
      INSERT INTO orders (
        order_number,
        customer_id,
        table_id,
        waiter_id,
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
        'pending',
        'pending',
        $10
      )
      RETURNING *
      `,
      [
        orderNumber || null,
        customerId || null,
        validTableId,
        employeeId,
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

    let calculatedSubtotal = 0;

    if (items && items.length > 0) {

      for (const item of items) {

        // ========================================================
        // GET PRODUCT FROM DATABASE
        // ========================================================

        const productResult = await client.query(
          `
          SELECT
            p.id,
            p.name,
            p.price,
            p.category_id,
            pc.name AS category_name,
            pc.type AS category_type

          FROM products p

          LEFT JOIN product_categories pc
            ON p.category_id = pc.id

          WHERE p.id = $1
          `,
          [item.productId || item.product_id]
        );


        if (productResult.rows.length === 0) {
          throw new Error(
            `Product with ID ${item.productId || item.product_id} not found`
          );
        }


        const product = productResult.rows[0];


        // ========================================================
        // USE REAL PRODUCT PRICE
        // ========================================================

        const unitPrice = Number(product.price || 0);

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
      }
    }


    // ============================================================
    // UPDATE ORDER TOTALS
    // USING REAL DATABASE PRODUCT PRICES
    // ============================================================

    const calculatedDiscount = Number(discount || 0);
    const calculatedTax = Number(tax || 0);
    const calculatedTotal = calculatedSubtotal - calculatedDiscount + calculatedTax;

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
          null,
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
        SET status = 'occupied'
        WHERE id = $1
        `,
        [validTableId]
      );
    }


    // ============================================================
    // COMMIT EVERYTHING
    // ============================================================

    await client.query("COMMIT");

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
    WHERE id = $2
    RETURNING *
    `,
    [status, id]
  );

  return result.rows[0] || null;
};


// ============================================================
// CREATE PAYMENT
// ============================================================

const createPayment = async (orderId, data) => {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const { amount, paymentMethod, reference, receivedBy } = data;

    // Validate Order ID
    const numericOrderId = Number(orderId);

    if (!Number.isInteger(numericOrderId)) {
      throw new Error("Invalid order ID");
    }

    // Validate Payment Amount
    const paymentAmount = Number(amount);

    if (!Number.isFinite(paymentAmount) || paymentAmount <= 0) {
      throw new Error("Invalid payment amount");
    }

    if (!paymentMethod) {
      throw new Error("Payment method is required");
    }

    // Find Order
    const orderResult = await client.query(
      `
      SELECT id, total, payment_status, table_id
      FROM orders
      WHERE id = $1
      `,
      [numericOrderId]
    );

    if (orderResult.rows.length === 0) {
      throw new Error("Order not found");
    }

    const order = orderResult.rows[0];
    const orderTotal = Number(order.total);

    // Get Previous Payments
    const paidResult = await client.query(
      `
      SELECT COALESCE(SUM(amount), 0) AS paid_amount
      FROM payments
      WHERE order_id = $1 AND status = 'paid'
      `,
      [numericOrderId]
    );

    const paidAmount = Number(paidResult.rows[0].paid_amount || 0);
    const remainingAmount = orderTotal - paidAmount;

    // Prevent Overpayment (with 0.05 ETB rounding tolerance)
    if (paymentAmount > remainingAmount + 0.05) {
      throw new Error(
        `Payment exceeds remaining balance of ${remainingAmount.toFixed(2)}`
      );
    }

    // Create Payment Record
    const paymentResult = await client.query(
      `
      INSERT INTO payments (
        order_id,
        amount,
        payment_method,
        reference,
        status,
        received_by
      )
      VALUES ($1, $2, $3, $4, 'paid', $5)
      RETURNING *
      `,
      [
        numericOrderId,
        paymentAmount,
        paymentMethod,
        reference || null,
        receivedBy || null,
      ]
    );

    const newPaidAmount = paidAmount + paymentAmount;
    let paymentStatus = "partial";

    if (newPaidAmount >= orderTotal - 0.05) {
      paymentStatus = "paid";
    }

    // Update Order Status
    await client.query(
      `
      UPDATE orders
      SET
        payment_status = $1,
        status = CASE WHEN $3 = 'paid' THEN 'completed' ELSE status END,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = $2
      `,
      [paymentStatus, numericOrderId, paymentStatus]
    );

    // Release Table
    if (paymentStatus === "paid" && order.table_id) {
      await client.query(
        `
        UPDATE restaurant_tables
        SET status = 'available'
        WHERE id = $1
        `,
        [order.table_id]
      );
    }

    await client.query("COMMIT");

    return paymentResult.rows[0];

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
    SELECT id, table_number, capacity, location, status, created_at
    FROM restaurant_tables
    ORDER BY id ASC
  `);

  return result.rows;
};


// ============================================================
// CREATE RESTAURANT TABLE
// ============================================================

const createTable = async (data) => {
  const { tableNumber, capacity = 2, location = null } = data;

  const result = await pool.query(
    `
    INSERT INTO restaurant_tables (table_number, capacity, location, status)
    VALUES ($1, $2, $3, 'available')
    RETURNING *
    `,
    [tableNumber, capacity, location]
  );

  return result.rows[0];
};


// ============================================================
// UPDATE RESTAURANT TABLE
// ============================================================

const updateTable = async (id, data) => {
  const { tableNumber, capacity, location, status } = data;

  const result = await pool.query(
    `
    UPDATE restaurant_tables
    SET
      table_number = COALESCE($1, table_number),
      capacity = COALESCE($2, capacity),
      location = COALESCE($3, location),
      status = COALESCE($4, status)
    WHERE id = $5
    RETURNING *
    `,
    [
      tableNumber || null,
      capacity || null,
      location || null,
      status || null,
      id,
    ]
  );

  return result.rows[0] || null;
};


// ============================================================
// DELETE RESTAURANT TABLE
// ============================================================

const deleteTable = async (id) => {
  const result = await pool.query(
    `
    DELETE FROM restaurant_tables
    WHERE id = $1
    RETURNING *
    `,
    [id]
  );

  return result.rows[0] || null;
};


// ============================================================
// EXPORTS
// ============================================================

module.exports = {
  getAllOrders,
  getOrderById,
  createOrder,
  updateOrderStatus,
  createPayment,

  getAllTables,
  createTable,
  updateTable,
  deleteTable,
};
