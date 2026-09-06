const pool = require("../../config/database");

/**
 * Normalizes payment method classification and calculates all cash drawer inflows/outflows
 */
const getPaymentSalesStats = async (cashierId, startTime, endTime = null, shiftId = null) => {
  // 1. Successful paid orders
  const salesResult = await pool.query(
    `
    SELECT 
      COALESCE(SUM(CASE WHEN LOWER(payment_method) = 'cash' THEN amount ELSE 0 END), 0) AS cash_sales,
      COALESCE(SUM(CASE WHEN LOWER(payment_method) IN ('card', 'pos', 'visa', 'mastercard') THEN amount ELSE 0 END), 0) AS card_sales,
      COALESCE(SUM(CASE WHEN LOWER(payment_method) IN ('telebirr', 'cbe_birr', 'cbebirr', 'mobile', 'bank_transfer', 'transfer') THEN amount ELSE 0 END), 0) AS mobile_sales,
      COALESCE(SUM(CASE WHEN LOWER(payment_method) IN ('credit', 'vip') THEN amount ELSE 0 END), 0) AS credit_sales,
      COALESCE(SUM(amount), 0) AS total_sales,
      COUNT(DISTINCT order_id) AS total_orders_count
    FROM payments
    WHERE (received_by = $1 OR ($4::int IS NOT NULL AND cashier_shift_id = $4::int))
      AND status = 'paid'
      AND paid_at >= $2
      AND ($3::timestamp IS NULL OR paid_at <= $3::timestamp)
    `,
    [cashierId, startTime, endTime, shiftId]
  );

  // 2. Breakdown of paid orders by method
  const breakdownResult = await pool.query(
    `
    SELECT 
      payment_method, 
      COUNT(*) AS transactions_count, 
      COALESCE(SUM(amount), 0) AS total_amount
    FROM payments
    WHERE (received_by = $1 OR ($4::int IS NOT NULL AND cashier_shift_id = $4::int))
      AND status = 'paid'
      AND paid_at >= $2
      AND ($3::timestamp IS NULL OR paid_at <= $3::timestamp)
    GROUP BY payment_method
    ORDER BY total_amount DESC
    `,
    [cashierId, startTime, endTime, shiftId]
  );

  // 3. Customer cash refunds
  const refundsResult = await pool.query(
    `
    SELECT COALESCE(SUM(amount), 0) AS cash_refunds
    FROM payments
    WHERE (received_by = $1 OR ($4::int IS NOT NULL AND cashier_shift_id = $4::int))
      AND status = 'refunded'
      AND LOWER(payment_method) = 'cash'
      AND paid_at >= $2
      AND ($3::timestamp IS NULL OR paid_at <= $3::timestamp)
    `,
    [cashierId, startTime, endTime, shiftId]
  );

  // 4. VIP Debt repayments collected in cash
  const repaymentsResult = await pool.query(
    `
    SELECT COALESCE(SUM(amount), 0) AS repayments_cash
    FROM customer_repayments
    WHERE (received_by = $1 OR ($4::int IS NOT NULL AND cashier_shift_id = $4::int))
      AND LOWER(payment_method) = 'cash'
      AND created_at >= $2
      AND ($3::timestamp IS NULL OR created_at <= $3::timestamp)
    `,
    [cashierId, startTime, endTime, shiftId]
  );

  // 5. Drawer cash expenses / paid outs
  const expensesResult = await pool.query(
    `
    SELECT COALESCE(SUM(amount), 0) AS expenses_cash
    FROM expenses
    WHERE created_by = $1
      AND LOWER(payment_method) = 'cash'
      AND created_at >= $2
      AND ($3::timestamp IS NULL OR created_at <= $3::timestamp)
    `,
    [cashierId, startTime, endTime]
  );

  // 6. Open / unsettled orders created during shift
  const openOrdersResult = await pool.query(
    `
    SELECT COUNT(DISTINCT id) AS open_orders_count
    FROM orders
    WHERE status NOT IN ('completed', 'cancelled')
      AND payment_status != 'paid'
      AND created_at >= $1
      AND ($2::timestamp IS NULL OR created_at <= $2::timestamp)
    `,
    [startTime, endTime]
  );

  const row = salesResult.rows[0];
  const cashRefunds = parseFloat(refundsResult.rows[0]?.cash_refunds || 0);
  const repaymentsCash = parseFloat(repaymentsResult.rows[0]?.repayments_cash || 0);
  const expensesCash = parseFloat(expensesResult.rows[0]?.expenses_cash || 0);
  const openOrdersCount = parseInt(openOrdersResult.rows[0]?.open_orders_count || 0, 10);

  return {
    cashSales: parseFloat(row.cash_sales || 0),
    cardSales: parseFloat(row.card_sales || 0),
    mobileSales: parseFloat(row.mobile_sales || 0),
    creditSales: parseFloat(row.credit_sales || 0),
    totalSales: parseFloat(row.total_sales || 0),
    totalOrdersCount: parseInt(row.total_orders_count || 0, 10),
    cashRefunds,
    repaymentsCash,
    expensesCash,
    openOrdersCount,
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
  // 1. Check for active open shift
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

  // 3. Compute stats
  const isLive = shift.status === "open";
  const stats = await getPaymentSalesStats(
    cashierId,
    shift.start_time,
    isLive ? null : shift.end_time,
    shift.id
  );

  const openingCash = parseFloat(shift.opening_cash || 0);
  const expectedCash = openingCash + stats.cashSales + stats.repaymentsCash - stats.expensesCash - stats.cashRefunds;

  return {
    ...shift,
    opening_cash: openingCash,
    expected_cash: isLive ? expectedCash : parseFloat(shift.expected_cash || expectedCash),
    actual_cash: parseFloat(shift.actual_cash || 0),
    shortage_overage: parseFloat(shift.shortage_overage || 0),
    total_card_sales: isLive ? stats.cardSales : parseFloat(shift.total_card_sales || 0),
    total_mobile_sales: isLive ? stats.mobileSales : parseFloat(shift.total_mobile_sales || 0),
    total_credit_sales: isLive ? stats.creditSales : parseFloat(shift.total_credit_sales || 0),
    total_repayments_cash: isLive ? stats.repaymentsCash : parseFloat(shift.total_repayments_cash || 0),
    total_expenses_cash: isLive ? stats.expensesCash : parseFloat(shift.total_expenses_cash || 0),
    total_refunds_cash: isLive ? stats.cashRefunds : parseFloat(shift.total_refunds_cash || 0),
    total_sales: isLive ? stats.totalSales : parseFloat(shift.total_sales || 0),
    total_orders_count: isLive ? stats.totalOrdersCount : parseInt(shift.total_orders_count || 0, 10),
    open_unpaid_orders_count: stats.openOrdersCount,
    payments_breakdown: stats.breakdown,
    is_live: isLive,
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
      total_repayments_cash,
      total_expenses_cash,
      total_refunds_cash,
      total_sales,
      total_orders_count,
      status,
      updated_at
    )
    VALUES ($1, $2, $3, CURRENT_TIMESTAMP, $4, $4, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 'open', CURRENT_TIMESTAMP)
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
    open_unpaid_orders_count: 0,
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

  // 2. Compute final stats
  const stats = await getPaymentSalesStats(cashierId, shift.start_time, null, shift.id);
  const openingCash = parseFloat(shift.opening_cash || 0);
  const expectedCash = openingCash + stats.cashSales + stats.repaymentsCash - stats.expensesCash - stats.cashRefunds;
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
      total_repayments_cash = $7,
      total_expenses_cash = $8,
      total_refunds_cash = $9,
      total_sales = $10,
      total_orders_count = $11,
      cashier_notes = $12,
      status = 'closed_pending_approval',
      updated_at = CURRENT_TIMESTAMP
    WHERE id = $13
    RETURNING *
    `,
    [
      expectedCash,
      countedCash,
      shortageOverage,
      stats.cardSales,
      stats.mobileSales,
      stats.creditSales,
      stats.repaymentsCash,
      stats.expensesCash,
      stats.cashRefunds,
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
    total_repayments_cash: stats.repaymentsCash,
    total_expenses_cash: stats.expensesCash,
    total_refunds_cash: stats.cashRefunds,
    total_sales: stats.totalSales,
    total_orders_count: stats.totalOrdersCount,
    open_unpaid_orders_count: stats.openOrdersCount,
    payments_breakdown: stats.breakdown,
  };
};

module.exports = {
  getCurrentShift,
  startShift,
  closeShift,
  getPaymentSalesStats,
};
