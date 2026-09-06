const pool = require("../../config/database");

// =========================================================
// GET ALL CASHIER SHIFTS
// =========================================================

const getCashierShifts = async () => {
  const result = await pool.query(`
    SELECT 
      cs.id,
      cs.cashier_id,
      COALESCE(cs.cashier_name, e.first_name || ' ' || e.last_name, u.username) AS cashier_name,
      cs.terminal_id,
      cs.start_time,
      cs.end_time,
      cs.opening_cash,
      cs.expected_cash,
      cs.actual_cash,
      cs.shortage_overage,
      cs.total_card_sales,
      cs.total_mobile_sales,
      cs.total_credit_sales,
      cs.total_repayments_cash,
      cs.total_expenses_cash,
      cs.total_refunds_cash,
      cs.total_sales,
      cs.total_orders_count,
      cs.status,
      cs.cashier_notes,
      cs.verified_by,
      COALESCE(cs.verified_by_name, ve.first_name || ' ' || ve.last_name, vu.username) AS verified_by_name,
      cs.verified_at,
      cs.verification_notes,
      cs.created_at,
      cs.updated_at
    FROM cashier_shifts cs
    LEFT JOIN users u ON cs.cashier_id = u.id
    LEFT JOIN employees e ON e.user_id = u.id
    LEFT JOIN users vu ON cs.verified_by = vu.id
    LEFT JOIN employees ve ON ve.user_id = vu.id
    ORDER BY cs.start_time DESC
  `);

  return result.rows.map((row) => ({
    ...row,
    opening_cash: parseFloat(row.opening_cash || 0),
    expected_cash: parseFloat(row.expected_cash || 0),
    actual_cash: parseFloat(row.actual_cash || 0),
    shortage_overage: parseFloat(row.shortage_overage || 0),
    total_card_sales: parseFloat(row.total_card_sales || 0),
    total_mobile_sales: parseFloat(row.total_mobile_sales || 0),
    total_credit_sales: parseFloat(row.total_credit_sales || 0),
    total_repayments_cash: parseFloat(row.total_repayments_cash || 0),
    total_expenses_cash: parseFloat(row.total_expenses_cash || 0),
    total_refunds_cash: parseFloat(row.total_refunds_cash || 0),
    total_sales: parseFloat(row.total_sales || 0),
    total_orders_count: parseInt(row.total_orders_count || 0, 10),
  }));
};


// =========================================================
// GET CASHIER SHIFT BY ID
// =========================================================

const getCashierShiftById = async (id) => {
  const result = await pool.query(
    `
    SELECT 
      cs.id,
      cs.cashier_id,
      COALESCE(cs.cashier_name, e.first_name || ' ' || e.last_name, u.username) AS cashier_name,
      cs.terminal_id,
      cs.start_time,
      cs.end_time,
      cs.opening_cash,
      cs.expected_cash,
      cs.actual_cash,
      cs.shortage_overage,
      cs.total_card_sales,
      cs.total_mobile_sales,
      cs.total_credit_sales,
      cs.total_repayments_cash,
      cs.total_expenses_cash,
      cs.total_refunds_cash,
      cs.total_sales,
      cs.total_orders_count,
      cs.status,
      cs.cashier_notes,
      cs.verified_by,
      COALESCE(cs.verified_by_name, ve.first_name || ' ' || ve.last_name, vu.username) AS verified_by_name,
      cs.verified_at,
      cs.verification_notes,
      cs.created_at,
      cs.updated_at
    FROM cashier_shifts cs
    LEFT JOIN users u ON cs.cashier_id = u.id
    LEFT JOIN employees e ON e.user_id = u.id
    LEFT JOIN users vu ON cs.verified_by = vu.id
    LEFT JOIN employees ve ON ve.user_id = vu.id
    WHERE cs.id = $1
    `,
    [id]
  );

  const shift = result.rows[0];
  if (!shift) return null;

  // Fetch payments breakdown for this shift
  const breakdownResult = await pool.query(
    `
    SELECT 
      payment_method, 
      COUNT(*) AS transactions_count, 
      COALESCE(SUM(amount), 0) AS total_amount
    FROM payments
    WHERE (received_by = $1 OR cashier_shift_id = $4)
      AND status = 'paid'
      AND paid_at >= $2
      AND ($3::timestamp IS NULL OR paid_at <= $3::timestamp)
    GROUP BY payment_method
    ORDER BY total_amount DESC
    `,
    [shift.cashier_id, shift.start_time, shift.end_time, shift.id]
  );

  return {
    ...shift,
    opening_cash: parseFloat(shift.opening_cash || 0),
    expected_cash: parseFloat(shift.expected_cash || 0),
    actual_cash: parseFloat(shift.actual_cash || 0),
    shortage_overage: parseFloat(shift.shortage_overage || 0),
    total_card_sales: parseFloat(shift.total_card_sales || 0),
    total_mobile_sales: parseFloat(shift.total_mobile_sales || 0),
    total_credit_sales: parseFloat(shift.total_credit_sales || 0),
    total_repayments_cash: parseFloat(shift.total_repayments_cash || 0),
    total_expenses_cash: parseFloat(shift.total_expenses_cash || 0),
    total_refunds_cash: parseFloat(shift.total_refunds_cash || 0),
    total_sales: parseFloat(shift.total_sales || 0),
    total_orders_count: parseInt(shift.total_orders_count || 0, 10),
    payments_breakdown: breakdownResult.rows.map((b) => ({
      paymentMethod: b.payment_method,
      transactionsCount: parseInt(b.transactions_count, 10),
      totalAmount: parseFloat(b.total_amount),
    })),
  };
};


// =========================================================
// VERIFY / RECONCILE CASHIER SHIFT
// =========================================================

const verifyCashierShift = async (id, status, notes, verifiedBy, verifiedByName = null) => {
  const result = await pool.query(
    `
    UPDATE cashier_shifts
    SET 
      status = $1,
      verification_notes = $2,
      verified_by = $3,
      verified_by_name = COALESCE($4, verified_by_name),
      verified_at = CURRENT_TIMESTAMP,
      updated_at = CURRENT_TIMESTAMP
    WHERE id = $5
    RETURNING *
    `,
    [status, notes || null, verifiedBy || null, verifiedByName || null, id]
  );

  return result.rows[0];
};


// =========================================================
// EXPORT
// =========================================================

module.exports = {
  getCashierShifts,
  getCashierShiftById,
  verifyCashierShift,
};
