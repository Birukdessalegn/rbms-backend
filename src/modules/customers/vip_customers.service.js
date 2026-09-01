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

const recordRepayment = async (customerId, repayData) => {
  const { amount, method, reference, notes } = repayData;
  const repayAmt = Number(amount);
  const insertQuery = `
    INSERT INTO customer_repayments (customer_id, amount, payment_method, reference, notes)
    VALUES ($1, $2, $3, $4, $5)
    RETURNING *;
  `;
  const { rows: repayRows } = await pool.query(insertQuery, [customerId, repayAmt, method || "cash", reference || null, notes || null]);
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

module.exports = {
  getAllVipCustomers,
  createVipCustomer,
  updateVipCustomer,
  recordRepayment,
  deleteVipCustomer,
};
