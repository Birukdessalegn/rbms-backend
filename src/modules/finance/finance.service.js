const pool = require("../../config/database");

// =========================================================
// GET ALL CASHIER SHIFTS
// =========================================================

const getCashierShifts = async () => {
  const result = await pool.query(`
    SELECT 
      cs.id,
      cs.cashier_id,
      COALESCE(e.first_name || ' ' || e.last_name, u.username) AS cashier_name,
      cs.terminal_id,
      cs.start_time,
      cs.end_time,
      cs.expected_cash,
      cs.actual_cash,
      cs.shortage_overage,
      cs.total_card_sales,
      cs.total_mobile_sales,
      cs.status,
      cs.verification_notes
    FROM cashier_shifts cs
    LEFT JOIN users u ON cs.cashier_id = u.id
    LEFT JOIN employees e ON e.user_id = u.id
    ORDER BY cs.start_time DESC
  `);

  return result.rows;
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
      COALESCE(e.first_name || ' ' || e.last_name, u.username) AS cashier_name,
      cs.terminal_id,
      cs.start_time,
      cs.end_time,
      cs.expected_cash,
      cs.actual_cash,
      cs.shortage_overage,
      cs.total_card_sales,
      cs.total_mobile_sales,
      cs.status,
      cs.verification_notes
    FROM cashier_shifts cs
    LEFT JOIN users u ON cs.cashier_id = u.id
    LEFT JOIN employees e ON e.user_id = u.id
    WHERE cs.id = $1
    `,
    [id]
  );

  return result.rows[0];
};


// =========================================================
// VERIFY / RECONCILE CASHIER SHIFT
// =========================================================

const verifyCashierShift = async (id, status, notes, verifiedBy) => {
  const result = await pool.query(
    `
    UPDATE cashier_shifts
    SET 
      status = $1,
      verification_notes = $2,
      verified_by = $3,
      verified_at = CURRENT_TIMESTAMP
    WHERE id = $4
    RETURNING *
    `,
    [status, notes || null, verifiedBy || null, id]
  );

  return result.rows[0];
};


// =========================================================
// CREATE CASHIER SHIFT (START SHIFT)
// =========================================================

const createCashierShift = async (shiftData) => {
  const {
    cashierId,
    terminalId,
    expectedCash,
    actualCash,
    shortageOverage,
    totalCardSales,
    totalMobileSales,
  } = shiftData;

  const result = await pool.query(
    `
    INSERT INTO cashier_shifts (
      cashier_id,
      terminal_id,
      expected_cash,
      actual_cash,
      shortage_overage,
      total_card_sales,
      total_mobile_sales,
      status
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
    RETURNING *
    `,
    [
      cashierId,
      terminalId || 1,
      expectedCash || 0,
      actualCash || 0,
      shortageOverage || 0,
      totalCardSales || 0,
      totalMobileSales || 0,
      "pending",
    ]
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
  createCashierShift,
};
