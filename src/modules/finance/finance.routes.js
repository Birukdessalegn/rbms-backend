const express = require("express");
const router = express.Router();
const financeController = require("./finance.controller");
const authenticate = require("../../middleware/auth.middleware");

// =========================================================
// CASHIER SHIFT RECONCILIATION ROUTES
// =========================================================

router.get("/cashier-shifts", authenticate, financeController.getCashierShifts);
router.get("/cashier-shifts/:id", authenticate, financeController.getCashierShiftById);
router.post("/cashier-shifts/:id/verify", authenticate, financeController.verifyCashierShift);

module.exports = router;
