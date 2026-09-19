// ============================================================
// LIGHTWEIGHT IN-MEMORY RATE LIMITER (ZERO DEPENDENCIES)
// cPanel & Native Node.js compatible
// ============================================================

const rateLimit = ({
  windowMs = 30 * 1000, // 30 seconds default window
  max = 10,             // Max 10 attempts per window
  message = "Too many login attempts. Please wait 30 seconds before trying again.",
} = {}) => {
  const hits = new Map();

  // Periodic cleanup of expired records to avoid memory leak
  const cleanupInterval = setInterval(() => {
    const now = Date.now();
    for (const [key, record] of hits.entries()) {
      if (now - record.startTime > windowMs) {
        hits.delete(key);
      }
    }
  }, Math.max(windowMs, 30 * 1000));

  // Ensure interval does not prevent Node process from gracefully exiting
  if (cleanupInterval.unref) {
    cleanupInterval.unref();
  }

  return (req, res, next) => {
    // Extract client IP address safely
    const forwarded = req.headers["x-forwarded-for"];
    const ip = (forwarded ? forwarded.split(",")[0].trim() : null) ||
      req.socket?.remoteAddress ||
      req.ip ||
      "unknown-client";

    const now = Date.now();
    const record = hits.get(ip);

    if (!record || now - record.startTime > windowMs) {
      hits.set(ip, { count: 1, startTime: now });
      return next();
    }

    record.count += 1;

    if (record.count > max) {
      const remainingSeconds = Math.ceil((windowMs - (now - record.startTime)) / 1000);
      return res.status(429).json({
        success: false,
        message: `${message} (${remainingSeconds}s remaining)`,
        retryAfter: remainingSeconds,
      });
    }

    next();
  };
};

module.exports = rateLimit;
