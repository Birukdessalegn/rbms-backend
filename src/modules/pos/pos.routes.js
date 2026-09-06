const express = require("express");

const router = express.Router();

const posController = require("./pos.controller");
const shiftsController = require("./shifts.controller");
const authenticate = require("../../middleware/auth.middleware");

// ============================================================
// CASHIER SHIFTS & DAILY AUDIT
// ============================================================

// Get current shift (with live computed sales totals)
router.get(
  "/shifts/current",
  authenticate,
  shiftsController.getCurrentShift
);

// Start a new shift
router.post(
  "/shifts/start",
  authenticate,
  shiftsController.startShift
);

// Close current shift and submit physical drawer count
router.post(
  "/shifts/close",
  authenticate,
  shiftsController.closeShift
);

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

// Add items to existing order (food or bar)
router.post(
  "/orders/:id/items",
  authenticate,
  posController.addOrderItems
);

// Remove/void item from order (cancels in kitchen/bar and restores inventory)
router.delete(
  "/orders/:id/items/:itemId",
  authenticate,
  posController.removeOrderItem
);

// Update order item (quantity or notes)
router.put(
  "/orders/:id/items/:itemId",
  authenticate,
  posController.updateOrderItem
);

// Make payment (supports both :id and :orderId URL parameters)
router.post(
  "/orders/:id/payment",
  authenticate,
  posController.createPayment
);

router.post(
  "/orders/:orderId/payment",
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

// Update restaurant table status
router.put(
  "/tables/:id/status",
  authenticate,
  posController.updateTableStatus
);

// Delete restaurant table
router.delete(
  "/tables/:id",
  authenticate,
  posController.deleteTable
);

module.exports = router;