const pool = require("../../config/database");

// ============================================================
// GET ALL PAYMENTS
// ============================================================

const getAllPayments = async () => {
  const result = await pool.query(`
    SELECT
      p.id,
      p.order_id,
      o.order_number,
      p.amount,
      p.payment_method,
      p.reference,
      p.status,
      p.paid_at,
      p.received_by,
      COALESCE(p.receipt_image, p.image_url) AS image_url,
      COALESCE(p.receipt_image, p.image_url) AS receipt_image,
      COALESCE(p.receipt_image, p.image_url) AS receipt_url,
      (COALESCE(p.receipt_image, p.image_url) IS NOT NULL) AS has_receipt,

      e.first_name AS received_by_first_name,
      e.last_name AS received_by_last_name

    FROM payments p

    LEFT JOIN orders o
      ON p.order_id = o.id

    LEFT JOIN users u
      ON p.received_by = u.id

    LEFT JOIN employees e
      ON e.user_id = u.id

    ORDER BY p.paid_at DESC, p.id DESC
  `);

  return result.rows;
};


// ============================================================
// GET PAYMENT BY ID
// ============================================================

const getPaymentById = async (id) => {
  const result = await pool.query(
    `
    SELECT
      p.id,
      p.order_id,
      o.order_number,
      o.total AS order_total,
      p.amount,
      p.payment_method,
      p.reference,
      p.status,
      p.paid_at,
      p.received_by,
      COALESCE(p.receipt_image, p.image_url) AS image_url,
      COALESCE(p.receipt_image, p.image_url) AS receipt_image,
      COALESCE(p.receipt_image, p.image_url) AS receipt_url,
      (COALESCE(p.receipt_image, p.image_url) IS NOT NULL) AS has_receipt

    FROM payments p

    LEFT JOIN orders o
      ON p.order_id = o.id

    WHERE p.id = $1
    `,
    [id]
  );

  return result.rows[0];
};


// ============================================================
// GET PAYMENTS FOR AN ORDER
// ============================================================

const getPaymentsByOrderId = async (orderId) => {
  const result = await pool.query(
    `
    SELECT
      p.id,
      p.order_id,
      o.order_number,
      o.total AS order_total,
      p.amount,
      p.payment_method,
      p.reference,
      p.status,
      p.paid_at,
      p.received_by,
      COALESCE(p.receipt_image, p.image_url) AS image_url,
      COALESCE(p.receipt_image, p.image_url) AS receipt_image,
      COALESCE(p.receipt_image, p.image_url) AS receipt_url,
      (COALESCE(p.receipt_image, p.image_url) IS NOT NULL) AS has_receipt

    FROM payments p

    LEFT JOIN orders o
      ON p.order_id = o.id

    WHERE p.order_id = $1

    ORDER BY p.paid_at DESC, p.id DESC
    `,
    [orderId]
  );

  return result.rows;
};


// ============================================================
// CREATE PAYMENT
// ============================================================

const createPayment = async (data) => {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const {
      orderId,
      amount,
      paymentMethod,
      reference,
      receivedBy,
    } = data;
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

    // --------------------------------------------------------
    // Check order
    // --------------------------------------------------------

    const orderResult = await client.query(
      `
      SELECT
        id,
        total,
        payment_status
      FROM orders
      WHERE id = $1
      FOR UPDATE
      `,
      [orderId]
    );

    if (orderResult.rows.length === 0) {
      throw new Error("Order not found");
    }

    const order = orderResult.rows[0];

    // --------------------------------------------------------
    // Validate amount
    // --------------------------------------------------------

    if (!amount || Number(amount) <= 0) {
      throw new Error("Payment amount must be greater than zero");
    }

    // --------------------------------------------------------
    // Calculate already paid amount
    // --------------------------------------------------------

    const paidResult = await client.query(
      `
      SELECT COALESCE(SUM(amount), 0) AS paid_amount
      FROM payments
      WHERE order_id = $1
        AND status = 'paid'
      `,
      [orderId]
    );

    const alreadyPaid = Number(
      paidResult.rows[0].paid_amount || 0
    );

    let orderTotal = Number(order.total || 0);
    const paymentAmount = Number(amount);

    if (alreadyPaid + paymentAmount > orderTotal) {
      await client.query(
        `
        UPDATE orders
        SET total = $1, updated_at = CURRENT_TIMESTAMP
        WHERE id = $2
        `,
        [alreadyPaid + paymentAmount, orderId]
      );
      orderTotal = alreadyPaid + paymentAmount;
    }

    const remainingAmount =
      orderTotal - alreadyPaid;

    if (paymentAmount > remainingAmount + 0.05) {
      throw new Error(
        `Payment exceeds remaining balance of ${remainingAmount.toFixed(2)}`
      );
    }

    let validReceivedBy = null;
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    if (receivedBy && uuidRegex.test(String(receivedBy))) {
      validReceivedBy = receivedBy;
    }

    // --------------------------------------------------------
    // Insert payment
    // --------------------------------------------------------

    const paymentResult = await client.query(
      `
      INSERT INTO payments (
        order_id,
        amount,
        payment_method,
        reference,
        status,
        paid_at,
        received_by,
        image_url,
        receipt_image
      )
      VALUES (
        $1,
        $2,
        $3,
        $4,
        'paid',
        CURRENT_TIMESTAMP,
        $5,
        $6,
        $6
      )
      RETURNING *
      `,
      [
        orderId,
        paymentAmount,
        paymentMethod,
        reference || null,
        validReceivedBy,
        finalImageUrl,
      ]
    );

    // --------------------------------------------------------
    // Determine new payment status
    // --------------------------------------------------------

    const totalPaid =
      alreadyPaid + paymentAmount;

    let newPaymentStatus = "partial";

    if (totalPaid >= orderTotal) {
      newPaymentStatus = "paid";
    }

    // --------------------------------------------------------
    // Update order
    // --------------------------------------------------------

    await client.query(
      `
      UPDATE orders
      SET
        payment_status = $1,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = $2
      `,
      [
        newPaymentStatus,
        orderId,
      ]
    );

    await client.query("COMMIT");

    return paymentResult.rows[0];

  } catch (error) {

    await client.query("ROLLBACK");

    throw error;

  } finally {

    client.release();

  }
};


// ============================================================
// REFUND PAYMENT
// ============================================================

const refundPayment = async (id) => {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const paymentResult = await client.query(
      `
      SELECT *
      FROM payments
      WHERE id = $1
      FOR UPDATE
      `,
      [id]
    );

    if (paymentResult.rows.length === 0) {
      throw new Error("Payment not found");
    }

    const payment = paymentResult.rows[0];

    if (payment.status === "refunded") {
      throw new Error("Payment is already refunded");
    }

    // Mark payment refunded
    const updatedPayment = await client.query(
      `
      UPDATE payments
      SET status = 'refunded'
      WHERE id = $1
      RETURNING *
      `,
      [id]
    );

    // Calculate remaining paid amount
    const paidResult = await client.query(
      `
      SELECT
        COALESCE(SUM(amount), 0) AS paid_amount
      FROM payments
      WHERE order_id = $1
        AND status = 'paid'
      `,
      [payment.order_id]
    );

    const paidAmount =
      Number(paidResult.rows[0].paid_amount);

    const orderResult = await client.query(
      `
      SELECT total
      FROM orders
      WHERE id = $1
      `,
      [payment.order_id]
    );

    const orderTotal =
      Number(orderResult.rows[0].total);

    let paymentStatus = "pending";

    if (paidAmount > 0 && paidAmount < orderTotal) {
      paymentStatus = "partial";
    }

    if (paidAmount >= orderTotal) {
      paymentStatus = "paid";
    }

    // Update order payment status
    await client.query(
      `
      UPDATE orders
      SET
        payment_status = $1,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = $2
      `,
      [
        paymentStatus,
        payment.order_id,
      ]
    );

    await client.query("COMMIT");

    return updatedPayment.rows[0];

  } catch (error) {

    await client.query("ROLLBACK");

    throw error;

  } finally {

    client.release();

  }
};


module.exports = {
  getAllPayments,
  getPaymentById,
  getPaymentsByOrderId,
  createPayment,
  refundPayment,
};