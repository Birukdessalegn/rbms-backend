const pool = require("../../config/database");
const notificationsService = require("../notifications/notifications.service");

// Helper to calculate the next due date for a monthly recurring bill
const getNextDueDate = (dueDay) => {
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth(); // 0-indexed
  const currentDate = now.getDate();

  // Find max days in current month (e.g. 28, 30, 31)
  const maxDaysThisMonth = new Date(currentYear, currentMonth + 1, 0).getDate();
  const clampedDueDayThisMonth = Math.min(dueDay, maxDaysThisMonth);

  let targetDate = new Date(currentYear, currentMonth, clampedDueDayThisMonth);
  // Reset time to start of day
  targetDate.setHours(0, 0, 0, 0);

  const todayStart = new Date(currentYear, currentMonth, currentDate);
  todayStart.setHours(0, 0, 0, 0);

  // If the due day this month has already passed by more than 1 day, target next month
  if (targetDate < todayStart) {
    const nextMonth = currentMonth + 1;
    const maxDaysNextMonth = new Date(currentYear, nextMonth + 1, 0).getDate();
    const clampedDueDayNextMonth = Math.min(dueDay, maxDaysNextMonth);
    targetDate = new Date(currentYear, nextMonth, clampedDueDayNextMonth);
    targetDate.setHours(0, 0, 0, 0);
  }

  return targetDate;
};

// ============================================================
// GET ALL RECURRING EXPENSES
// ============================================================
const getAllRecurringExpenses = async () => {
  const result = await pool.query(`
    SELECT
      re.id,
      re.title,
      re.category_id,
      ec.name AS category_name,
      re.amount,
      re.frequency,
      re.due_day,
      re.payment_method,
      re.notify_before_days,
      re.last_notified_date,
      re.status,
      re.notes,
      re.created_by,
      re.created_at,
      re.updated_at
    FROM recurring_expenses re
    LEFT JOIN expense_categories ec ON re.category_id = ec.id
    ORDER BY re.due_day ASC, re.created_at DESC
  `);

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  return result.rows.map((row) => {
    const nextDue = getNextDueDate(row.due_day);
    const diffMs = nextDue.getTime() - today.getTime();
    const daysUntilDue = Math.round(diffMs / (1000 * 60 * 60 * 24));

    return {
      ...row,
      next_due_date: nextDue.toISOString().split("T")[0],
      days_until_due: daysUntilDue,
      is_due_today: daysUntilDue === 0,
      is_due_soon: daysUntilDue > 0 && daysUntilDue <= (row.notify_before_days || 3),
    };
  });
};

// ============================================================
// GET RECURRING EXPENSE BY ID
// ============================================================
const getRecurringExpenseById = async (id) => {
  const result = await pool.query(
    `
    SELECT
      re.id,
      re.title,
      re.category_id,
      ec.name AS category_name,
      re.amount,
      re.frequency,
      re.due_day,
      re.payment_method,
      re.notify_before_days,
      re.last_notified_date,
      re.status,
      re.notes,
      re.created_by,
      re.created_at,
      re.updated_at
    FROM recurring_expenses re
    LEFT JOIN expense_categories ec ON re.category_id = ec.id
    WHERE re.id = $1
    `,
    [id]
  );

  if (!result.rows[0]) return null;

  const row = result.rows[0];
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const nextDue = getNextDueDate(row.due_day);
  const diffMs = nextDue.getTime() - today.getTime();
  const daysUntilDue = Math.round(diffMs / (1000 * 60 * 60 * 24));

  return {
    ...row,
    next_due_date: nextDue.toISOString().split("T")[0],
    days_until_due: daysUntilDue,
    is_due_today: daysUntilDue === 0,
    is_due_soon: daysUntilDue > 0 && daysUntilDue <= (row.notify_before_days || 3),
  };
};

// ============================================================
// CREATE RECURRING EXPENSE
// ============================================================
const createRecurringExpense = async (data) => {
  const {
    title,
    categoryId,
    amount,
    frequency = "monthly",
    dueDay = 1,
    paymentMethod = "bank_transfer",
    notifyBeforeDays = 3,
    notes = "",
    createdBy = null,
  } = data;

  const result = await pool.query(
    `
    INSERT INTO recurring_expenses (
      title,
      category_id,
      amount,
      frequency,
      due_day,
      payment_method,
      notify_before_days,
      notes,
      created_by
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
    RETURNING *
    `,
    [
      title,
      categoryId || null,
      amount,
      frequency,
      Number(dueDay) || 1,
      paymentMethod,
      Number(notifyBeforeDays) || 3,
      notes,
      createdBy,
    ]
  );

  return result.rows[0];
};

// ============================================================
// UPDATE RECURRING EXPENSE
// ============================================================
const updateRecurringExpense = async (id, data) => {
  const {
    title,
    categoryId,
    amount,
    frequency,
    dueDay,
    paymentMethod,
    notifyBeforeDays,
    status,
    notes,
  } = data;

  const result = await pool.query(
    `
    UPDATE recurring_expenses
    SET
      title = COALESCE($1, title),
      category_id = COALESCE($2, category_id),
      amount = COALESCE($3, amount),
      frequency = COALESCE($4, frequency),
      due_day = COALESCE($5, due_day),
      payment_method = COALESCE($6, payment_method),
      notify_before_days = COALESCE($7, notify_before_days),
      status = COALESCE($8, status),
      notes = COALESCE($9, notes),
      updated_at = CURRENT_TIMESTAMP
    WHERE id = $10
    RETURNING *
    `,
    [
      title,
      categoryId,
      amount,
      frequency,
      dueDay !== undefined ? Number(dueDay) : null,
      paymentMethod,
      notifyBeforeDays !== undefined ? Number(notifyBeforeDays) : null,
      status,
      notes,
      id,
    ]
  );

  return result.rows[0];
};

// ============================================================
// DELETE RECURRING EXPENSE
// ============================================================
const deleteRecurringExpense = async (id) => {
  const result = await pool.query(
    `DELETE FROM recurring_expenses WHERE id = $1 RETURNING *`,
    [id]
  );
  return result.rows[0];
};

// ============================================================
// RECORD 1-CLICK PAYMENT FOR RECURRING EXPENSE
// ============================================================
const recordPayment = async (id, paymentData = {}) => {
  const recurring = await getRecurringExpenseById(id);
  if (!recurring) {
    throw new Error("Recurring expense schedule not found");
  }

  const now = new Date();
  const monthName = now.toLocaleString("default", { month: "short" });
  const year = now.getFullYear();

  const expenseNumber = `EXP-REC-${Date.now().toString().slice(-6)}`;
  const description = `${recurring.title} (${monthName} ${year})`;
  const amount = paymentData.amount || recurring.amount;
  const paymentMethod = paymentData.paymentMethod || recurring.payment_method || "bank_transfer";
  const expenseDate = paymentData.expenseDate || now.toISOString().split("T")[0];
  const reference = paymentData.reference || `REC-${recurring.id}-${year}${String(now.getMonth() + 1).padStart(2, "0")}`;
  const notes = paymentData.notes || `Automated recurring payment logged from schedule: ${recurring.title}`;
  const createdBy = paymentData.userId || recurring.created_by || null;

  // Insert into expenses table
  const insertResult = await pool.query(
    `
    INSERT INTO expenses (
      expense_number,
      description,
      category_id,
      amount,
      payment_method,
      expense_date,
      status,
      reference,
      notes,
      created_by
    )
    VALUES ($1, $2, $3, $4, $5, $6, 'paid', $7, $8, $9)
    RETURNING *
    `,
    [
      expenseNumber,
      description,
      recurring.category_id,
      amount,
      paymentMethod,
      expenseDate,
      reference,
      notes,
      createdBy,
    ]
  );

  const createdExpense = insertResult.rows[0];

  // Send confirmation notification to Finance, Admin & Manager
  try {
    await notificationsService.createNotification({
      targetRoles: ["admin", "manager", "finance"],
      title: "Recurring Bill Paid",
      message: `Recurring bill "${recurring.title}" (${Number(amount).toLocaleString()} ETB) has been marked as paid. Ref: ${reference}`,
      type: "success",
      referenceType: "expense",
      referenceId: createdExpense.id,
    });
  } catch (notifErr) {
    console.error("Failed to dispatch recurring bill payment notification:", notifErr);
  }

  return {
    expense: createdExpense,
    recurring,
  };
};

// ============================================================
// CHECK DUE RECURRING EXPENSES AND NOTIFY ADMIN / FINANCE
// ============================================================
const checkDueRecurringExpensesAndNotify = async () => {
  try {
    const list = await getAllRecurringExpenses();
    const todayStr = new Date().toISOString().split("T")[0];

    for (const item of list) {
      if (item.status !== "active") continue;

      // Don't send notification multiple times on the same date
      if (item.last_notified_date) {
        const lastDateStr = new Date(item.last_notified_date).toISOString().split("T")[0];
        if (lastDateStr === todayStr) {
          continue;
        }
      }

      // If due today (days_until_due === 0)
      if (item.is_due_today) {
        await notificationsService.createNotification({
          targetRoles: ["admin", "manager", "finance"],
          title: `⚠️ Payment Due Today: ${item.title}`,
          message: `Monthly payment of ${Number(item.amount).toLocaleString()} ETB for "${item.title}" is due today.`,
          type: "warning",
          referenceType: "expense",
          referenceId: item.id,
        });

        await pool.query(
          `UPDATE recurring_expenses SET last_notified_date = CURRENT_DATE WHERE id = $1`,
          [item.id]
        );
      }
      // If due in 1 to notify_before_days (e.g. 1 to 3 days)
      else if (item.is_due_soon) {
        await notificationsService.createNotification({
          targetRoles: ["admin", "manager", "finance"],
          title: `Upcoming Payment: ${item.title}`,
          message: `Scheduled bill "${item.title}" (${Number(item.amount).toLocaleString()} ETB) is due in ${item.days_until_due} day(s) on Day ${item.due_day}.`,
          type: "info",
          referenceType: "expense",
          referenceId: item.id,
        });

        await pool.query(
          `UPDATE recurring_expenses SET last_notified_date = CURRENT_DATE WHERE id = $1`,
          [item.id]
        );
      }
    }
  } catch (err) {
    console.error("Error in checkDueRecurringExpensesAndNotify:", err);
  }
};

module.exports = {
  getAllRecurringExpenses,
  getRecurringExpenseById,
  createRecurringExpense,
  updateRecurringExpense,
  deleteRecurringExpense,
  recordPayment,
  checkDueRecurringExpensesAndNotify,
};
