const express = require("express");

const router = express.Router();

const paymentsController =
  require("./payments.controller");


// ============================================================
// PAYMENTS
// ============================================================

// Get all payments
router.get(
  "/",
  paymentsController.getPayments
);


// Get payments for a specific order
router.get(
  "/order/:orderId",
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


// Refund payment
router.put(
  "/:id/refund",
  paymentsController.refundPayment
);


module.exports = router;