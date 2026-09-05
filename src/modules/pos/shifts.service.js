const pool = require("../../config/database");

/**
 * Normalizes payment method classification into standard POS buckets
 */
const getPaymentSalesStats = async (cashierId, startTime, endTime = null) => {
  const result = await pool.query(
    `
    SELECT 
      COALESCE(SUM(CASE WHEN LOWER(payment_method) = 'cash' THEN amount ELSE 0 END), 0) AS cash_sales,
      COALESCE(SUM(CASE WHEN LOWER(payment_method) IN ('card', 'pos', 'visa', 'mastercard') THEN amount ELSE 0 END), 0) AS card_sales,
      COALESCE(SUM(CASE WHEN LOWER(payment_method) IN ('telebirr', 'cbe_birr', 'cbebirr', 'mobile', 'bank_transfer', 'transfer') THEN amount ELSE 0 END), 0) AS mobile_sales,
      COALESCE(SUM(CASE WHEN LOWER(payment_method) IN ('credit', 'vip') THEN amount ELSE 0 END), 0) AS credit_sales,
      COALESCE(SUM(amount), 0) AS total_sales,
      COUNT(DISTINCT order_id) AS total_orders_count
    FROM payments
    WHERE received_by = $1
      AND paid_at >= $2
      AND ($3::timestamp IS NULL OR paid_at <= $3::timestamp)
    `,
    [cashierId, startTime, endTime]
  );

  const breakdownResult = await pool.query(
    `
    SELECT 
      payment_method, 
      COUNT(*) AS transactions_count, 
      COALESCE(SUM(amount), 0) AS total_amount
    FROM payments
    WHERE received_by = $1
      AND paid_at >= $2
      AND ($3::timestamp IS NULL OR paid_at <= $3::timestamp)
    GROUP BY payment_method
    ORDER BY total_amount DESC
    `,
    [cashierId, startTime, endTime]
  );

  const row = result.rows[0];
  return {
    cashSales: parseFloat(row.cash_sales || 0),
    cardSales: parseFloat(row.card_sales || 0),
    mobileSales: parseFloat(row.mobile_sales || 0),
    creditSales: parseFloat(row.credit_sales || 0),
    totalSales: parseFloat(row.total_sales || 0),
    totalOrdersCount: parseInt(row.total_orders_count || 0, 10),
    breakdown: breakdownResult.rows.map((b) => ({
      paymentMethod: b.payment_method,
      transactionsCount: parseInt(b.transactions_count, 10),
      totalAmount: parseFloat(b.total_amount),
    })),
  };
};

// ============================================================
// GET CURRENT SHIFT FOR CASHIER
// ============================================================
const getCurrentShift = async (cashierId) => {
  // 1. Check for an active open shift
  const openResult = await pool.query(
    `
    SELECT 
      cs.*,
      COALESCE(e.first_name || ' ' || e.last_name, cs.cashier_name, u.username) AS cashier_display_name
    FROM cashier_shifts cs
    LEFT JOIN users u ON cs.cashier_id = u.id
    LEFT JOIN employees e ON e.user_id = u.id
    WHERE cs.cashier_id = $1 AND cs.status = 'open'
    ORDER BY cs.start_time DESC
    LIMIT 1
    `,
    [cashierId]
  );

  let shift = openResult.rows[0];

  // 2. If no open shift, check if there was a shift started today
  if (!shift) {
    const todayResult = await pool.query(
      `
      SELECT 
        cs.*,
        COALESCE(e.first_name || ' ' || e.last_name, cs.cashier_name, u.username) AS cashier_display_name
      FROM cashier_shifts cs
      LEFT JOIN users u ON cs.cashier_id = u.id
      LEFT JOIN employees e ON e.user_id = u.id
      WHERE cs.cashier_id = $1 AND cs.start_time >= CURRENT_DATE
      ORDER BY cs.start_time DESC
      LIMIT 1
      `,
      [cashierId]
    );

    shift = todayResult.rows[0];
  }

  if (!shift) {
    return null;
  }

  // 3. If the shift is open, compute live totals
  if (shift.status === "open") {
    const liveStats = await getPaymentSalesStats(cashierId, shift.start_time, null);
    const openingCash = parseFloat(shift.opening_cash || 0);
    const expectedCash = openingCash + liveStats.cashSales;

    return {
      ...shift,
      opening_cash: openingCash,
      expected_cash: expectedCash,
      total_card_sales: liveStats.cardSales,
      total_mobile_sales: liveStats.mobileSales,
      total_credit_sales: liveStats.creditSales,
      total_sales: liveStats.totalSales,
      total_orders_count: liveStats.totalOrdersCount,
      payments_breakdown: liveStats.breakdown,
      is_live: true,
    };
  }

  // If already closed, also return payment breakdown
  const stats = await getPaymentSalesStats(cashierId, shift.start_time, shift.end_time);
  return {
    ...shift,
    opening_cash: parseFloat(shift.opening_cash || 0),
    expected_cash: parseFloat(shift.expected_cash || 0),
    actual_cash: parseFloat(shift.actual_cash || 0),
    shortage_overage: parseFloat(shift.shortage_overage || 0),
    total_card_sales: parseFloat(shift.total_card_sales || 0),
    total_mobile_sales: parseFloat(shift.total_mobile_sales || 0),
    total_credit_sales: parseFloat(shift.total_credit_sales || 0),
    total_sales: parseFloat(shift.total_sales || 0),
    total_orders_count: parseInt(shift.total_orders_count || 0, 10),
    payments_breakdown: stats.breakdown,
    is_live: false,
  };
};

// ============================================================
// START SHIFT
// ============================================================
const startShift = async (cashierId, shiftData = {}) => {
  const { opening_cash, openingCash, terminal_id, terminalId } = shiftData;
  const initialCash = parseFloat(opening_cash !== undefined ? opening_cash : openingCash || 0.0);
  const terminal = terminal_id !== undefined ? terminal_id : terminalId || 1;

  // 1. Check if an active open shift already exists
  const existing = await pool.query(
    `SELECT id, status, start_time FROM cashier_shifts WHERE cashier_id = $1 AND status = 'open' LIMIT 1`,
    [cashierId]
  );

  if (existing.rows.length > 0) {
    throw new Error("You already have an active open shift. Please close it before starting a new one.");
  }

  // 2. Fetch cashier display name
  const userResult = await pool.query(
    `
    SELECT COALESCE(e.first_name || ' ' || e.last_name, u.username) AS display_name
    FROM users u
    LEFT JOIN employees e ON e.user_id = u.id
    WHERE u.id = $1
    `,
    [cashierId]
  );

  const cashierName = userResult.rows[0]?.display_name || "Cashier";

  // 3. Insert new shift
  const insertResult = await pool.query(
    `
    INSERT INTO cashier_shifts (
      cashier_id,
      cashier_name,
      terminal_id,
      start_time,
      opening_cash,
      expected_cash,
      actual_cash,
      shortage_overage,
      total_card_sales,
      total_mobile_sales,
      total_credit_sales,
      total_sales,
      total_orders_count,
      status,
      updated_at
    )
    VALUES ($1, $2, $3, CURRENT_TIMESTAMP, $4, $4, 0, 0, 0, 0, 0, 0, 0, 'open', CURRENT_TIMESTAMP)
    RETURNING *
    `,
    [cashierId, cashierName, terminal, initialCash]
  );

  const newShift = insertResult.rows[0];
  return {
    ...newShift,
    cashier_display_name: cashierName,
    opening_cash: parseFloat(newShift.opening_cash),
    expected_cash: parseFloat(newShift.expected_cash),
    payments_breakdown: [],
  };
};

// ============================================================
// CLOSE SHIFT
// ============================================================
const closeShift = async (cashierId, closingData = {}) => {
  const { actual_cash, actualCash, closing_notes, closingNotes, cashier_notes, cashierNotes } = closingData;
  const countedCash = parseFloat(actual_cash !== undefined ? actual_cash : actualCash);
  const notes = closing_notes || closingNotes || cashier_notes || cashierNotes || null;

  if (isNaN(countedCash)) {
    throw new Error("Actual counted cash (actual_cash) is required to close a shift.");
  }

  // 1. Get active open shift
  const openShiftResult = await pool.query(
    `SELECT * FROM cashier_shifts WHERE cashier_id = $1 AND status = 'open' ORDER BY start_time DESC LIMIT 1`,
    [cashierId]
  );

  const shift = openShiftResult.rows[0];
  if (!shift) {
    throw new Error("No active open shift found to close.");
  }

  // 2. Compute final sales stats up to current moment
  const stats = await getPaymentSalesStats(cashierId, shift.start_time, null);
  const openingCash = parseFloat(shift.opening_cash || 0);
  const expectedCash = openingCash + stats.cashSales;
  const shortageOverage = countedCash - expectedCash;

  // 3. Update shift to closed_pending_approval
  const updateResult = await pool.query(
    `
    UPDATE cashier_shifts
    SET 
      end_time = CURRENT_TIMESTAMP,
      expected_cash = $1,
      actual_cash = $2,
      shortage_overage = $3,
      total_card_sales = $4,
      total_mobile_sales = $5,
      total_credit_sales = $6,
      total_sales = $7,
      total_orders_count = $8,
      cashier_notes = $9,
      status = 'closed_pending_approval',
      updated_at = CURRENT_TIMESTAMP
    WHERE id = $10
    RETURNING *
    `,
    [
      expectedCash,
      countedCash,
      shortageOverage,
      stats.cardSales,
      stats.mobileSales,
      stats.creditSales,
      stats.totalSales,
      stats.totalOrdersCount,
      notes,
      shift.id,
    ]
  );

  const closedShift = updateResult.rows[0];
  return {
    ...closedShift,
    opening_cash: openingCash,
    expected_cash: expectedCash,
    actual_cash: countedCash,
    shortage_overage: shortageOverage,
    total_card_sales: stats.cardSales,
    total_mobile_sales: stats.mobileSales,
    total_credit_sales: stats.creditSales,
    total_sales: stats.totalSales,
    total_orders_count: stats.totalOrdersCount,
    payments_breakdown: stats.breakdown,
  };
};

module.exports = {
  getCurrentShift,
  startShift,
  closeShift,
  getPaymentSalesStats,
};
