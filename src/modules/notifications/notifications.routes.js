const express = require("express");
const router = express.Router();
const notificationsController = require("./notifications.controller");
const authenticate = require("../../middleware/auth.middleware");

// Optional authentication so it can be queried with or without token (fallback to all unread)
const optionalAuth = (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith("Bearer ")) {
    return authenticate(req, res, next);
  }
  next();
};

router.get("/", optionalAuth, notificationsController.getNotifications);
router.patch("/read-all", optionalAuth, notificationsController.markAllAsRead);
router.patch("/:id/read", optionalAuth, notificationsController.markAsRead);

module.exports = router;
