const subscriptionService = require("./subscription.service");

// Vendor master credentials from environment or trusted master defaults
const VENDOR_SECRET_KEY = process.env.VENDOR_SECRET_KEY || "AMBBA-RBMS-MASTER-2026";
const VENDOR_MASTER_PIN = process.env.VENDOR_MASTER_PIN || "9988";

/**
 * GET /api/subscription/status
 * Public endpoint to fetch live countdown, status, and expiry timestamp
 */
async function getStatus(req, res) {
  try {
    const status = await subscriptionService.getSubscriptionStatus();
    res.json({
      success: true,
      data: status,
    });
  } catch (err) {
    console.error("Error fetching subscription status:", err);
    res.status(500).json({
      success: false,
      message: "Unable to retrieve subscription status",
      error: err.message,
    });
  }
}

/**
 * POST /api/subscription/renew
 * Protected renewal & suspend endpoint:
 * Accepts requests with either:
 *  - Header X-Vendor-Key matching VENDOR_SECRET_KEY
 *  - Body masterPin matching VENDOR_MASTER_PIN
 *  - Authenticated admin user
 */
async function renew(req, res) {
  try {
    const vendorHeaderKey = req.headers["x-vendor-key"] || req.headers["x-master-key"];
    const { masterPin, days = 30, newExpiryDate, notes, isSuspended = false } = req.body;

    // Check authorization
    const isVendorKeyValid = vendorHeaderKey && vendorHeaderKey.trim() === VENDOR_SECRET_KEY;
    const isMasterPinValid = masterPin && String(masterPin).trim() === VENDOR_MASTER_PIN;
    const isAdminUser = req.user && ["admin", "superadmin", "owner"].includes(String(req.user.role).toLowerCase());

    if (!isVendorKeyValid && !isMasterPinValid && !isAdminUser) {
      return res.status(403).json({
        success: false,
        message: "Unauthorized: Valid Vendor Key, Master PIN, or Admin credentials required.",
      });
    }

    const updated = await subscriptionService.renewSubscription({
      days: Number(days) || 30,
      newExpiryDate,
      notes: notes || (isSuspended ? "Suspended by Vendor Master Portal" : `Extended by ${days} days`),
      isSuspended: Boolean(isSuspended),
    });

    res.json({
      success: true,
      message: isSuspended 
        ? "Subscription successfully suspended / locked!" 
        : `Subscription successfully renewed! Active through ${new Date(updated.expiresAt).toLocaleDateString()}`,
      data: updated,
    });
  } catch (err) {
    console.error("Error renewing subscription:", err);
    res.status(500).json({
      success: false,
      message: "Failed to renew subscription",
      error: err.message,
    });
  }
}

module.exports = {
  getStatus,
  renew,
};
