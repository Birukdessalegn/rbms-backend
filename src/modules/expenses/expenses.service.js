const pool = require("../../config/database");

// ============================================================
// GET ALL EXPENSES
// ============================================================

const getAllExpenses = async () => {
  const result = await pool.query(`
    SELECT
      e.id,
      e.expense_number,
      e.description,
      e.category_id,
      ec.name AS category_name,
      e.amount,
      e.payment_method,
      e.expense_date,
      e.status,
      e.reference,
      e.notes,
      e.created_by,
      e.approved_by,
      e.created_at,
      e.updated_at

    FROM expenses e

    LEFT JOIN expense_categories ec
      ON e.category_id = ec.id

    ORDER BY e.expense_date DESC, e.created_at DESC
  `);

  return result.rows;
};


// ============================================================
// GET EXPENSE BY ID
// ============================================================

const getExpenseById = async (id) => {
  const result = await pool.query(
    `
    SELECT
      e.id,
      e.expense_number,
      e.description,
      e.category_id,
      ec.name AS category_name,
      e.amount,
      e.payment_method,
      e.expense_date,
      e.status,
      e.reference,
      e.notes,
      e.created_by,
      e.approved_by,
      e.created_at,
      e.updated_at

    FROM expenses e

    LEFT JOIN expense_categories ec
      ON e.category_id = ec.id

    WHERE e.id = $1
    `,
    [id]
  );

  return result.rows[0];
};


// ============================================================
// CREATE EXPENSE
// ============================================================

const createExpense = async (data) => {
  const {
    expenseNumber,
    description,
    categoryId,
    amount,
    paymentMethod,
    expenseDate,
    status = "pending",
    reference,
    notes,
    createdBy,
  } = data;

  const result = await pool.query(
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
    VALUES (
      $1,$2,$3,$4,$5,
      COALESCE($6, CURRENT_DATE),
      $7,$8,$9,$10
    )
    RETURNING *
    `,
    [
      expenseNumber || null,
      description,
      categoryId || null,
      amount,
      paymentMethod || null,
      expenseDate || null,
      status,
      reference || null,
      notes || null,
      createdBy || null,
    ]
  );

  return result.rows[0];
};


// ============================================================
// UPDATE EXPENSE
// ============================================================

const updateExpense = async (id, data) => {
  const {
    description,
    categoryId,
    amount,
    paymentMethod,
    expenseDate,
    status,
    reference,
    notes,
  } = data;

  const result = await pool.query(
    `
    UPDATE expenses
    SET
      description = COALESCE($1, description),
      category_id = COALESCE($2, category_id),
      amount = COALESCE($3, amount),
      payment_method = COALESCE($4, payment_method),
      expense_date = COALESCE($5, expense_date),
      status = COALESCE($6, status),
      reference = COALESCE($7, reference),
      notes = COALESCE($8, notes),
      updated_at = CURRENT_TIMESTAMP

    WHERE id = $9

    RETURNING *
    `,
    [
      description,
      categoryId,
      amount,
      paymentMethod,
      expenseDate,
      status,
      reference,
      notes,
      id,
    ]
  );

  return result.rows[0];
};


// ============================================================
// DELETE EXPENSE
// ============================================================

const deleteExpense = async (id) => {
  const result = await pool.query(
    `
    DELETE FROM expenses
    WHERE id = $1
    RETURNING *
    `,
    [id]
  );

  return result.rows[0];
};


// ============================================================
// GET EXPENSE CATEGORIES
// ============================================================

const getExpenseCategories = async () => {
  const result = await pool.query(`
    SELECT
      id,
      name,
      description
    FROM expense_categories
    ORDER BY name ASC
  `);

  return result.rows;
};


// ============================================================
// GET EXPENSE SUMMARY
// ============================================================

const getExpenseSummary = async () => {
  const result = await pool.query(`
    SELECT
      COUNT(*) AS total_expenses,
      COALESCE(SUM(amount), 0) AS total_amount,

      COALESCE(
        SUM(
          CASE
            WHEN status = 'paid'
            THEN amount
            ELSE 0
          END
        ),
        0
      ) AS paid_amount,

      COALESCE(
        SUM(
          CASE
            WHEN status = 'pending'
            THEN amount
            ELSE 0
          END
        ),
        0
      ) AS pending_amount

    FROM expenses
  `);

  return result.rows[0];
};


module.exports = {
  getAllExpenses,
  getExpenseById,
  createExpense,
  updateExpense,
  deleteExpense,
  getExpenseCategories,
  getExpenseSummary,
};