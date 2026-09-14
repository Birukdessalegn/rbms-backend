const express = require("express");
const router = express.Router();
const notificationsController = require("./notifications.controller");
const authenticate = require("../../middleware/auth.middleware");

// Require authentication for all notification endpoints to protect role access
router.get("/", authenticate, notificationsController.getNotifications);
router.patch("/read-all", authenticate, notificationsController.markAllAsRead);
router.patch("/:id/read", authenticate, notificationsController.markAsRead);

module.exports = router;

