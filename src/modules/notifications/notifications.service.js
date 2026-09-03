const pool = require("../../config/database");

// ============================================================
// CREATE NOTIFICATION (TO SPECIFIC USER OR BY ROLE)
// ============================================================

const createNotification = async ({
  userId,
  targetRoles = ["admin", "manager"],
  title,
  message,
  type = "info",
  referenceType = null,
  referenceId = null,
}) => {
  try {
    // If specific userId provided, send directly
    if (userId) {
      const result = await pool.query(
        `
        INSERT INTO notifications (
          user_id,
          title,
          message,
          type,
          reference_type,
          reference_id
        )
        VALUES ($1, $2, $3, $4, $5, $6)
        RETURNING *
        `,
        [userId, title, message, type, referenceType, referenceId]
      );
      return result.rows;
    }

    // Broadcast to users matching targetRoles (e.g. admin, manager / F&B manager)
    const usersResult = await pool.query(
      `
      SELECT u.id
      FROM users u
      JOIN roles r ON u.role_id = r.id
      WHERE r.name = ANY($1) AND u.status = 'active'
      `,
      [targetRoles]
    );

    const inserted = [];
    for (const u of usersResult.rows) {
      const result = await pool.query(
        `
        INSERT INTO notifications (
          user_id,
          title,
          message,
          type,
          reference_type,
          reference_id
        )
        VALUES ($1, $2, $3, $4, $5, $6)
        RETURNING *
        `,
        [u.id, title, message, type, referenceType, referenceId]
      );
      inserted.push(result.rows[0]);
    }

    return inserted;
  } catch (error) {
    console.error("CREATE NOTIFICATION ERROR:", error.message);
    return [];
  }
};

// ============================================================
// GET NOTIFICATIONS (FOR USER OR ALL UNREAD)
// ============================================================

const getNotifications = async (userId, unreadOnly = false, limit = 50) => {
  let query = `
    SELECT
      n.id,
      n.user_id,
      n.title,
      n.message,
      n.type,
      n.reference_type,
      n.reference_id,
      n.is_read,
      n.created_at
    FROM notifications n
    WHERE 1=1
  `;
  const params = [];

  if (userId) {
    params.push(userId);
    query += ` AND n.user_id = $${params.length}`;
  }

  if (unreadOnly) {
    query += ` AND n.is_read = FALSE`;
  }

  query += ` ORDER BY n.created_at DESC`;

  if (limit) {
    params.push(limit);
    query += ` LIMIT $${params.length}`;
  }

  const result = await pool.query(query, params);
  return result.rows;
};

// ============================================================
// MARK AS READ
// ============================================================

const markAsRead = async (id, userId = null) => {
  let query = `UPDATE notifications SET is_read = TRUE WHERE id = $1`;
  const params = [id];

  if (userId) {
    params.push(userId);
    query += ` AND user_id = $2`;
  }

  query += ` RETURNING *`;

  const result = await pool.query(query, params);
  return result.rows[0];
};

// ============================================================
// MARK ALL AS READ
// ============================================================

const markAllAsRead = async (userId) => {
  let query = `UPDATE notifications SET is_read = TRUE WHERE is_read = FALSE`;
  const params = [];

  if (userId) {
    params.push(userId);
    query += ` AND user_id = $1`;
  }

  query += ` RETURNING *`;

  const result = await pool.query(query, params);
  return result.rows;
};

module.exports = {
  createNotification,
  getNotifications,
  markAsRead,
  markAllAsRead,
};
