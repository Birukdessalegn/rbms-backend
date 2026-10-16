const express = require("express");
const router = express.Router();
const jwt = require("jsonwebtoken");
const subscriptionController = require("./subscription.controller");

// Soft auth middleware to populate req.user if Bearer token is provided
const optionalAuth = (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith("Bearer ")) {
    try {
      const token = authHeader.split(" ")[1];
      req.user = jwt.verify(token, process.env.JWT_SECRET);
    } catch (_) {
      // Ignore invalid token so vendor-key or masterPin can still be evaluated
    }
  }
  next();
};

// GET /api/subscription/status - Get live subscription countdown & status
router.get("/status", subscriptionController.getStatus);

// POST /api/subscription/renew - Extend subscription by days or custom date
router.post("/renew", optionalAuth, subscriptionController.renew);

module.exports = router;
