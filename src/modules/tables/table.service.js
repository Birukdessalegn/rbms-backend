const pool = require("../../config/database");

// ============================================================
// GET ALL RESTAURANT TABLES
// ============================================================

const getAllTables = async () => {
  const result = await pool.query(`
    SELECT
      t.id,
      t.table_number,
      t.capacity,
      t.location,
      t.is_bar_seat,
      t.type,
      t.section,
      t.status,
      t.current_waiter_id,
      t.created_at,

      e.first_name AS waiter_first_name,
      e.last_name AS waiter_last_name,
      COALESCE(e.first_name || ' ' || e.last_name, u.username) AS current_waiter_name

    FROM restaurant_tables t

    LEFT JOIN employees e
      ON t.current_waiter_id = e.id

    LEFT JOIN users u
      ON e.user_id = u.id

    ORDER BY t.id ASC
  `);

  return result.rows;
};

// ============================================================
// GET TABLE BY ID
// ============================================================

const getTableById = async (id) => {
  const result = await pool.query(
    `
    SELECT
      t.id,
      t.table_number,
      t.capacity,
      t.location,
      t.is_bar_seat,
      t.type,
      t.section,
      t.status,
      t.current_waiter_id,
      t.created_at,

      e.first_name AS waiter_first_name,
      e.last_name AS waiter_last_name,
      COALESCE(e.first_name || ' ' || e.last_name, u.username) AS current_waiter_name

    FROM restaurant_tables t

    LEFT JOIN employees e
      ON t.current_waiter_id = e.id

    LEFT JOIN users u
      ON e.user_id = u.id

    WHERE t.id = $1
    `,
    [id]
  );

  return result.rows[0] || null;
};

// ============================================================
// CREATE TABLE / BAR STOOL
// ============================================================

const createTable = async (data) => {
  const tableNumber = data.tableNumber || data.table_number;
  const capacity = Number(data.capacity) || 2;
  const location = data.location || null;
  const isBarSeat = Boolean(data.is_bar_seat || data.isBarSeat);
  const type = data.type || (isBarSeat ? "bar" : "dining");
  const section = data.section || (isBarSeat ? "BAR" : type === "vip" ? "VIP" : "DINING");
  const status = data.status || "available";

  const result = await pool.query(
    `
    INSERT INTO restaurant_tables (
      table_number,
      capacity,
      location,
      is_bar_seat,
      type,
      section,
      status
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7)
    RETURNING *
    `,
    [tableNumber, capacity, location, isBarSeat, type, section, status]
  );

  return result.rows[0];
};

// ============================================================
// UPDATE TABLE / BAR STOOL
// ============================================================

const updateTable = async (id, data) => {
  const tableNumber = data.tableNumber !== undefined ? data.tableNumber : data.table_number;
  const capacity = data.capacity !== undefined ? Number(data.capacity) : undefined;
  const location = data.location !== undefined ? data.location : undefined;
  const isBarSeat = data.is_bar_seat !== undefined ? Boolean(data.is_bar_seat) : (data.isBarSeat !== undefined ? Boolean(data.isBarSeat) : undefined);
  const type = data.type !== undefined ? data.type : undefined;
  const section = data.section !== undefined ? data.section : undefined;
  const status = data.status !== undefined ? data.status : undefined;
  const currentWaiterId = data.current_waiter_id !== undefined ? data.current_waiter_id : (data.currentWaiterId !== undefined ? data.currentWaiterId : undefined);

  const result = await pool.query(
    `
    UPDATE restaurant_tables
    SET
      table_number = COALESCE($1, table_number),
      capacity = COALESCE($2, capacity),
      location = COALESCE($3, location),
      is_bar_seat = COALESCE($4, is_bar_seat),
      type = COALESCE($5, type),
      section = COALESCE($6, section),
      status = COALESCE($7, status),
      current_waiter_id = CASE
        WHEN $8::text = 'NULL' THEN NULL
        WHEN $8::integer IS NOT NULL THEN $8::integer
        ELSE current_waiter_id
      END
    WHERE id = $9
    RETURNING *
    `,
    [
      tableNumber ?? null,
      capacity ?? null,
      location ?? null,
      isBarSeat ?? null,
      type ?? null,
      section ?? null,
      status ?? null,
      currentWaiterId === null ? 'NULL' : (currentWaiterId ?? null),
      id,
    ]
  );

  return result.rows[0] || null;
};

// ============================================================
// UPDATE TABLE STATUS (e.g. occupied, available)
// ============================================================

const updateTableStatus = async (id, status, waiterId = null) => {
  const result = await pool.query(
    `
    UPDATE restaurant_tables
    SET
      status = $1,
      current_waiter_id = CASE
        WHEN $1 = 'available' THEN NULL
        WHEN $2::integer IS NOT NULL THEN $2::integer
        ELSE current_waiter_id
      END
    WHERE id = $3
    RETURNING *
    `,
    [status, waiterId || null, id]
  );

  return result.rows[0] || null;
};

// ============================================================
// DELETE TABLE BY ID (WITH ORDER UNLINKING)
// ============================================================

const deleteTable = async (id) => {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // 1. Unlink past orders so sales history is preserved
    await client.query(
      `UPDATE orders SET table_id = NULL WHERE table_id = $1`,
      [id]
    );

    // 2. Delete the table safely
    const result = await client.query(
      `DELETE FROM restaurant_tables WHERE id = $1 RETURNING *`,
      [id]
    );

    await client.query("COMMIT");
    return result.rows[0] || null;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
};

module.exports = {
  getAllTables,
  getTableById,
  createTable,
  updateTable,
  updateTableStatus,
  deleteTable,
};