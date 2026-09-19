const express = require("express");

const router = express.Router();

const barController = require("./bar.controller");
const authenticate = require("../../middleware/auth.middleware");

// Require authentication for all bar endpoints
router.use(authenticate);


// Get all bar orders
router.get(
  "/orders",
  barController.getBarOrders
);


// Get bar orders by status
router.get(
  "/orders/status",
  barController.getBarOrdersByStatus
);


// Get single bar order
router.get(
  "/orders/:id",
  barController.getBarOrder
);


// Update bar order status
router.put(
  "/orders/:id/status",
  barController.updateBarOrderStatus
);


module.exports = router;