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
      t.status,
      t.current_waiter_id,

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
      t.status,
      t.current_waiter_id,

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
  deleteTable,
};