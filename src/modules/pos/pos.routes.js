const express = require("express");

const router = express.Router();

const posController = require("./pos.controller");
const authenticate = require("../../middleware/auth.middleware");

// ============================================================
// ORDERS
// ============================================================

// Get all orders
router.get(
  "/orders",
  authenticate,
  posController.getOrders
);

// Get single order
router.get(
  "/orders/:id",
  authenticate,
  posController.getOrder
);

// Create order
// IMPORTANT: authenticate gives us req.user
router.post(
  "/orders",
  authenticate,
  posController.createOrder
);

// Update order status
router.put(
  "/orders/:id/status",
  authenticate,
  posController.updateOrderStatus
);

// Make payment
router.post(
  "/orders/:id/payment",
  authenticate,
  posController.createPayment
);

// ============================================================
// RESTAURANT TABLES
// ============================================================

// Get all restaurant tables
router.get(
  "/tables",
  authenticate,
  posController.getTables
);

// Create restaurant table
router.post(
  "/tables",
  authenticate,
  posController.createTable
);

// Update restaurant table
router.put(
  "/tables/:id",
  authenticate,
  posController.updateTable
);

// Delete restaurant table
router.delete(
  "/tables/:id",
  authenticate,
  posController.deleteTable
);

module.exports = router;