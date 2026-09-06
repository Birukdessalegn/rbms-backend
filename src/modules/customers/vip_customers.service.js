const pool = require("../../config/database");

const getAllVipCustomers = async () => {
  const query = `
    SELECT id, name, phone, tier, credit_limit, current_debt, company, notes, is_active, created_at
    FROM vip_customers
    WHERE is_active = TRUE
    ORDER BY name ASC;
  `;
  const { rows } = await pool.query(query);
  return rows;
};

const createVipCustomer = async (data) => {
  const { name, phone, tier, creditLimit, company, notes } = data;
  const query = `
    INSERT INTO vip_customers (name, phone, tier, credit_limit, company, notes)
    VALUES ($1, $2, $3, $4, $5, $6)
    RETURNING *;
  `;
  const values = [name, phone, tier || "Gold VIP", Number(creditLimit || 10000), company || null, notes || null];
  const { rows } = await pool.query(query, values);
  return rows[0];
};

const updateVipCustomer = async (id, data) => {
  const { name, phone, tier, creditLimit, company, notes } = data;
  const query = `
    UPDATE vip_customers
    SET name = COALESCE($1, name),
        phone = COALESCE($2, phone),
        tier = COALESCE($3, tier),
        credit_limit = COALESCE($4, credit_limit),
        company = COALESCE($5, company),
        notes = COALESCE($6, notes),
        updated_at = NOW()
    WHERE id = $7
    RETURNING *;
  `;
  const values = [name, phone, tier, creditLimit ? Number(creditLimit) : null, company, notes, id];
  const { rows } = await pool.query(query, values);
  return rows[0];
};

const recordRepayment = async (customerId, repayData, receivedBy = null) => {
  const { amount, method, reference, notes } = repayData;
  const repayAmt = Number(amount);

  let activeShiftId = null;
  if (receivedBy) {
    const shiftCheck = await pool.query(
      `SELECT id FROM cashier_shifts WHERE cashier_id = $1 AND status = 'open' ORDER BY start_time DESC LIMIT 1`,
      [receivedBy]
    );
    if (shiftCheck.rows.length > 0) {
      activeShiftId = shiftCheck.rows[0].id;
    }
  }

  const insertQuery = `
    INSERT INTO customer_repayments (customer_id, amount, payment_method, reference, notes, received_by, cashier_shift_id)
    VALUES ($1, $2, $3, $4, $5, $6, $7)
    RETURNING *;
  `;
  const { rows: repayRows } = await pool.query(insertQuery, [
    customerId,
    repayAmt,
    method || "cash",
    reference || null,
    notes || null,
    receivedBy || null,
    activeShiftId,
  ]);
  const updateDebtQuery = `
    UPDATE vip_customers
    SET current_debt = GREATEST(current_debt - $1, 0),
        updated_at = NOW()
    WHERE id = $2
    RETURNING *;
  `;
  const { rows: customerRows } = await pool.query(updateDebtQuery, [repayAmt, customerId]);
  return { repayment: repayRows[0], customer: customerRows[0] };
};

const deleteVipCustomer = async (id) => {
  const query = `UPDATE vip_customers SET is_active = FALSE WHERE id = $1 RETURNING id;`;
  const { rows } = await pool.query(query, [id]);
  return rows[0];
};

// Increases VIP spent balance when a credit purchase is made
const addVipDebt = async (customerId, amount) => {
  const spendAmt = Number(amount);
  if (isNaN(spendAmt) || spendAmt <= 0) {
    throw new Error("Invalid payment amount");
  }

  const { rows } = await pool.query(
    `SELECT id, name, credit_limit, current_debt FROM vip_customers WHERE id = $1 AND is_active = TRUE`,
    [customerId]
  );

  if (rows.length === 0) {
    throw new Error("VIP Customer not found or inactive");
  }

  const customer = rows[0];
  const creditLimit = Number(customer.credit_limit || 0);
  const currentDebt = Number(customer.current_debt || 0);
  const availableBalance = creditLimit - currentDebt;

  // Gold VIP or credit_limit <= 0 has UNLIMITED credit
  const isUnlimitedVip =
    (customer.tier && customer.tier.toLowerCase().includes("gold")) ||
    creditLimit <= 0;

  if (!isUnlimitedVip && availableBalance < spendAmt) {
    throw new Error(
      `Insufficient VIP balance. Remaining balance is ${availableBalance} ETB. Ask Admin to refill.`
    );
  }

  const query = `
    UPDATE vip_customers
    SET current_debt = current_debt + $1,
        updated_at = NOW()
    WHERE id = $2 AND is_active = TRUE
    RETURNING *;
  `;
  const { rows: updatedRows } = await pool.query(query, [spendAmt, customerId]);
  return updatedRows[0];
};

const getVipCustomerById = async (id) => {
  const query = `
    SELECT 
      id, name, phone, tier, credit_limit, current_debt, 
      (credit_limit - current_debt) AS available_credit,
      company, notes, is_active, created_at, updated_at
    FROM vip_customers
    WHERE id = $1 AND is_active = TRUE;
  `;
  const { rows } = await pool.query(query, [id]);
  if (rows.length === 0) return null;
  return rows[0];
};

const getVipCustomerPayments = async (id) => {
  const vipCustomer = await getVipCustomerById(id);
  if (!vipCustomer) {
    throw new Error("VIP Customer not found");
  }

  const paymentsQuery = `
    SELECT 
      p.id AS payment_id,
      p.amount AS payment_amount,
      p.payment_method,
      p.reference AS payment_reference,
      p.status AS payment_status,
      p.paid_at,
      p.image_url,
      p.receipt_image,

      o.id AS order_id,
      o.order_number,
      o.order_type,
      o.status AS order_status,
      o.payment_status AS order_payment_status,
      o.subtotal AS order_subtotal,
      o.tax AS order_tax,
      o.discount AS order_discount,
      o.total AS order_total,
      o.created_at AS order_created_at,

      rt.table_number,
      COALESCE(e.first_name || ' ' || e.last_name, 'Staff') AS waiter_name

    FROM payments p
    JOIN orders o ON p.order_id = o.id
    LEFT JOIN restaurant_tables rt ON o.table_id = rt.id
    LEFT JOIN employees e ON o.waiter_id = e.id
    WHERE p.vip_customer_id = $1 OR o.vip_customer_id = $1
    ORDER BY p.paid_at DESC;
  `;

  const { rows: payments } = await pool.query(paymentsQuery, [id]);

  if (payments.length > 0) {
    const orderIds = [...new Set(payments.map((p) => p.order_id))];
    const itemsQuery = `
      SELECT 
        oi.id,
        oi.order_id,
        oi.product_id,
        oi.quantity,
        oi.unit_price,
        oi.discount,
        oi.total,
        oi.notes,
        p.name AS product_name,
        p.unit
      FROM order_items oi
      JOIN products p ON oi.product_id = p.id
      WHERE oi.order_id = ANY($1::int[])
      ORDER BY oi.id ASC;
    `;
    const { rows: items } = await pool.query(itemsQuery, [orderIds]);

    const itemsByOrderId = {};
    for (const item of items) {
      if (!itemsByOrderId[item.order_id]) {
        itemsByOrderId[item.order_id] = [];
      }
      itemsByOrderId[item.order_id].push(item);
    }

    for (const payment of payments) {
      payment.items = itemsByOrderId[payment.order_id] || [];
    }
  }

  return payments;
};

const getVipCustomerRepayments = async (id) => {
  const query = `
    SELECT id, customer_id, amount, payment_method, reference, notes, created_at
    FROM customer_repayments
    WHERE customer_id = $1
    ORDER BY created_at DESC;
  `;
  const { rows } = await pool.query(query, [id]);
  return rows;
};

const getVipCustomerTransactions = async (id) => {
  const payments = await getVipCustomerPayments(id);
  const repayments = await getVipCustomerRepayments(id);

  const formattedPayments = payments.map((p) => ({
    id: `pay-${p.payment_id}`,
    transaction_type: "order_payment",
    amount: Number(p.payment_amount),
    payment_method: p.payment_method,
    reference: p.payment_reference,
    date: p.paid_at,
    order_id: p.order_id,
    order_number: p.order_number,
    table_number: p.table_number,
    waiter_name: p.waiter_name,
    items: p.items,
  }));

  const formattedRepayments = repayments.map((r) => ({
    id: `repay-${r.id}`,
    transaction_type: "debt_repayment",
    amount: Number(r.amount),
    payment_method: r.payment_method,
    reference: r.reference,
    date: r.created_at,
    notes: r.notes,
  }));

  const combined = [...formattedPayments, ...formattedRepayments].sort(
    (a, b) => new Date(b.date) - new Date(a.date)
  );

  return combined;
};

module.exports = {
  getAllVipCustomers,
  getVipCustomerById,
  createVipCustomer,
  updateVipCustomer,
  recordRepayment,
  deleteVipCustomer,
  addVipDebt,
  getVipCustomerPayments,
  getVipCustomerRepayments,
  getVipCustomerTransactions,
};

