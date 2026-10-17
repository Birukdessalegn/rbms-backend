const pool = require("../../config/database");

/**
 * Initialize system_subscription table in PostgreSQL if it doesn't exist
 * and ensure an initial active 30-day subscription is seeded.
 */
async function initializeSubscriptionTable() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS system_subscription (
        id SERIAL PRIMARY KEY,
        client_name VARCHAR(150) DEFAULT 'The Oak Club',
        is_active BOOLEAN DEFAULT TRUE,
        start_date TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
        grace_days INTEGER DEFAULT 3,
        last_renewed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        notes TEXT,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      );
    `);

    // Check if subscription record exists, otherwise seed an INACTIVE initial record (pending vendor activation)
    const { rows } = await pool.query(`SELECT id FROM system_subscription LIMIT 1`);
    if (rows.length === 0) {
      const now = new Date();
      await pool.query(
        `INSERT INTO system_subscription 
          (client_name, is_active, start_date, expires_at, grace_days, notes) 
         VALUES ($1, $2, NOW(), $3, $4, $5)`,
        [
          "The Oak Club",
          false,
          now.toISOString(),
          3,
          "Pending initial license activation from AmbbaTech Master Portal",
        ]
      );
      console.log("🔒 Initial subscription record created as INACTIVE (Pending Vendor Activation)");
    }
  } catch (err) {
    console.error("⚠️ Failed to initialize system_subscription table:", err.message);
  }
}

/**
 * Get live subscription status
 */
async function getSubscriptionStatus() {
  let sub = null;
  try {
    await initializeSubscriptionTable();
    const { rows } = await pool.query(
      `SELECT * FROM system_subscription ORDER BY id ASC LIMIT 1`
    );
    if (rows && rows.length > 0) {
      sub = rows[0];
    }
  } catch (dbErr) {
    console.warn("⚠️ Subscription DB read fallback:", dbErr.message);
  }

  if (!sub) {
    const now = new Date();
    return {
      status: "expired",
      clientName: "The Oak Club",
      isActive: false,
      daysRemaining: 0,
      hoursRemaining: 0,
      isGracePeriod: false,
      isExpired: true,
      expiresAt: now.toISOString(),
      hardLockoutDate: now.toISOString(),
      graceDays: 3,
      notes: "Pending initial license activation from AmbbaTech Master Portal",
      serverTime: now.toISOString(),
    };
  }

  const now = new Date();
  const expiresAt = new Date(sub.expires_at);
  const graceDays = Number(sub.grace_days ?? 3);

  // Expiration including grace period
  const hardLockoutDate = new Date(expiresAt.getTime() + graceDays * 86400000);

  const diffMs = expiresAt.getTime() - now.getTime();
  const diffGraceMs = hardLockoutDate.getTime() - now.getTime();

  const daysRemaining = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
  const hoursRemaining = Math.max(0, Math.ceil(diffMs / (1000 * 60 * 60)));

  let status = "active";
  let isGracePeriod = false;
  let isExpired = false;

  // If manually deactivated/suspended by vendor
  if (sub.is_active === false) {
    status = "expired";
    isExpired = true;
  } else if (diffMs > 0) {
    if (daysRemaining <= 5) {
      status = "warning"; // <= 5 days remaining
    } else {
      status = "active";
    }
  } else if (diffGraceMs > 0) {
    // Within 3-day grace period
    status = "grace";
    isGracePeriod = true;
  } else {
    // Past grace period -> complete lockout
    status = "expired";
    isExpired = true;
  }

  return {
    id: sub.id,
    clientName: sub.client_name,
    isActive: sub.is_active === true && !isExpired,
    status, // 'active' | 'warning' | 'grace' | 'expired'
    daysRemaining: isExpired ? 0 : Math.max(0, daysRemaining),
    hoursRemaining: isExpired ? 0 : hoursRemaining,
    graceDaysRemaining: isGracePeriod ? Math.max(0, Math.ceil(diffGraceMs / (1000 * 60 * 60 * 24))) : 0,
    isGracePeriod,
    isExpired,
    startDate: sub.start_date,
    expiresAt: sub.expires_at,
    hardLockoutDate: hardLockoutDate.toISOString(),
    graceDays,
    lastRenewedAt: sub.last_renewed_at,
    notes: sub.notes,
    serverTime: now.toISOString(),
  };
}

/**
 * Renew, extend, or suspend subscription
 * @param {Object} params
 * @param {number} [params.days=30] Number of days to extend
 * @param {string} [params.newExpiryDate] Specific ISO date to set
 * @param {string} [params.notes] Payment or reference note
 * @param {boolean} [params.isSuspended=false] Whether to suspend/block immediately
 */
async function renewSubscription({ days = 30, newExpiryDate, notes, isSuspended = false }) {
  await initializeSubscriptionTable();

  const { rows } = await pool.query(
    `SELECT * FROM system_subscription ORDER BY id ASC LIMIT 1`
  );

  let currentExpiry = rows.length > 0 ? new Date(rows[0].expires_at) : new Date();
  const now = new Date();

  // If vendor wants to lock/suspend this client immediately
  if (isSuspended) {
    const expiredDate = new Date(now.getTime() - 5 * 86400000); // 5 days in past (past grace period)
    await pool.query(
      `UPDATE system_subscription 
       SET 
         is_active = FALSE,
         expires_at = $1,
         last_renewed_at = NOW(),
         notes = COALESCE($2, notes),
         updated_at = NOW()
       WHERE id = (SELECT id FROM system_subscription ORDER BY id ASC LIMIT 1)`,
      [expiredDate.toISOString(), notes || "Suspended by Vendor Master Portal"]
    );
    return getSubscriptionStatus();
  }

  // Otherwise, active extension
  let updatedExpiry;
  if (newExpiryDate) {
    updatedExpiry = new Date(newExpiryDate);
  } else {
    // If currently active and unexpired, add days to existing expiration.
    // Otherwise, start counting days fresh from NOW.
    const isCurrentlyActive = rows.length > 0 && rows[0].is_active === true && currentExpiry > now;
    const baseDate = isCurrentlyActive ? currentExpiry : now;
    updatedExpiry = new Date(baseDate.getTime() + Number(days) * 86400000);
  }

  await pool.query(
    `UPDATE system_subscription 
     SET 
       is_active = TRUE,
       expires_at = $1,
       last_renewed_at = NOW(),
       notes = COALESCE($2, notes),
       updated_at = NOW()
     WHERE id = (SELECT id FROM system_subscription ORDER BY id ASC LIMIT 1)`,
    [updatedExpiry.toISOString(), notes || `Extended by ${days} days`]
  );

  return getSubscriptionStatus();
}

module.exports = {
  initializeSubscriptionTable,
  getSubscriptionStatus,
  renewSubscription,
};
