const pool = require("../../config/database");

// ============================================================
// GET ALL ACCOUNTS
// ============================================================
const getAllAccounts = async (onlyActive = false) => {
  const whereClause = onlyActive ? "WHERE is_active = TRUE" : "";
  const result = await pool.query(
    `
    SELECT
      id,
      account_type,
      provider,
      account_number,
      account_holder,
      notes,
      is_active,
      created_at,
      updated_at
    FROM payment_accounts
    ${whereClause}
    ORDER BY is_active DESC, provider ASC, id ASC
    `
  );

  return result.rows;
};

// ============================================================
// GET ACCOUNT BY ID
// ============================================================
const getAccountById = async (id) => {
  const result = await pool.query(
    `
    SELECT * FROM payment_accounts WHERE id = $1
    `,
    [Number(id)]
  );

  return result.rows[0] || null;
};

// ============================================================
// CREATE ACCOUNT
// ============================================================
const createAccount = async (data) => {
  const {
    account_type = "bank",
    provider,
    account_number,
    account_holder = "The Oak Club",
    notes = "",
    is_active = true,
  } = data;

  if (!provider || !account_number) {
    throw new Error("Provider name and account number are required.");
  }

  const cleanProvider = String(provider).trim();
  const cleanAccountNumber = String(account_number).trim();
  const cleanAccountHolder = account_holder ? String(account_holder).trim() : "The Oak Club";
  const cleanNotes = notes ? String(notes).trim() : null;
  const cleanType = String(account_type || "bank").trim().toLowerCase();

  if (cleanProvider.length > 100) {
    throw new Error("Provider name cannot exceed 100 characters.");
  }
  if (cleanAccountNumber.length > 100) {
    throw new Error("Account number cannot exceed 100 characters.");
  }
  if (cleanAccountHolder && cleanAccountHolder.length > 150) {
    throw new Error("Account holder name cannot exceed 150 characters.");
  }
  if (cleanNotes && cleanNotes.length > 255) {
    throw new Error("Notes cannot exceed 255 characters.");
  }

  const result = await pool.query(
    `
    INSERT INTO payment_accounts (
      account_type,
      provider,
      account_number,
      account_holder,
      notes,
      is_active
    )
    VALUES ($1, $2, $3, $4, $5, $6)
    RETURNING *
    `,
    [
      cleanType,
      cleanProvider,
      cleanAccountNumber,
      cleanAccountHolder,
      cleanNotes,
      Boolean(is_active),
    ]
  );

  return result.rows[0];
};

// ============================================================
// UPDATE ACCOUNT
// ============================================================
const updateAccount = async (id, data) => {
  const existing = await getAccountById(id);
  if (!existing) {
    throw new Error("Payment account not found.");
  }

  const {
    account_type = existing.account_type,
    provider = existing.provider,
    account_number = existing.account_number,
    account_holder = existing.account_holder,
    notes = existing.notes,
    is_active = existing.is_active,
  } = data;

  const cleanProvider = String(provider).trim();
  const cleanAccountNumber = String(account_number).trim();
  const cleanAccountHolder = account_holder ? String(account_holder).trim() : null;
  const cleanNotes = notes ? String(notes).trim() : null;
  const cleanType = String(account_type || existing.account_type).trim().toLowerCase();

  if (cleanProvider.length > 100) {
    throw new Error("Provider name cannot exceed 100 characters.");
  }
  if (cleanAccountNumber.length > 100) {
    throw new Error("Account number cannot exceed 100 characters.");
  }
  if (cleanAccountHolder && cleanAccountHolder.length > 150) {
    throw new Error("Account holder name cannot exceed 150 characters.");
  }
  if (cleanNotes && cleanNotes.length > 255) {
    throw new Error("Notes cannot exceed 255 characters.");
  }

  const result = await pool.query(
    `
    UPDATE payment_accounts
    SET
      account_type = $1,
      provider = $2,
      account_number = $3,
      account_holder = $4,
      notes = $5,
      is_active = $6,
      updated_at = CURRENT_TIMESTAMP
    WHERE id = $7
    RETURNING *
    `,
    [
      cleanType,
      cleanProvider,
      cleanAccountNumber,
      cleanAccountHolder,
      cleanNotes,
      Boolean(is_active),
      Number(id),
    ]
  );

  return result.rows[0];
};

// ============================================================
// DELETE ACCOUNT
// ============================================================
const deleteAccount = async (id) => {
  const result = await pool.query(
    `
    DELETE FROM payment_accounts WHERE id = $1 RETURNING id
    `,
    [Number(id)]
  );

  return result.rows[0] || null;
};

module.exports = {
  getAllAccounts,
  getAccountById,
  createAccount,
  updateAccount,
  deleteAccount,
};
