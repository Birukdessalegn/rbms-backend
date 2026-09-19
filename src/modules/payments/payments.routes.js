const express = require("express");

const router = express.Router();

const paymentsController =
  require("./payments.controller");
const authenticate = require("../../middleware/auth.middleware");
const authorize = require("../../middleware/role.middleware");

// Protect payment routes with authentication
router.use(authenticate);

// ============================================================
// PAYMENTS
// ============================================================

// Get all payments
router.get(
  "/",
  paymentsController.getPayments
);


// Get payments for a specific order (both singular and plural aliases)
router.get(
  "/order/:orderId",
  paymentsController.getPaymentsByOrder
);

router.get(
  "/orders/:orderId",
  paymentsController.getPaymentsByOrder
);


// Get payment by ID
router.get(
  "/:id",
  paymentsController.getPayment
);


// Create payment
router.post(
  "/",
  paymentsController.createPayment
);


// Refund payment (Strictly restricted to Admin and Manager)
router.put(
  "/:id/refund",
  authorize("admin", "manager"),
  paymentsController.refundPayment
);


module.exports = router;