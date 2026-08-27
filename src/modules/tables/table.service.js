const pool = require("../../config/database");

// ============================================================
// GET ALL RESTAURANT TABLES
// ============================================================

const getAllTables = async () => {
  const result = await pool.query(`
    SELECT
      id,
      table_number,
      capacity,
      status
    FROM restaurant_tables
    ORDER BY id ASC
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
      id,
      table_number,
      capacity,
      status
    FROM restaurant_tables
    WHERE id = $1
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