const express = require("express");
const router = express.Router();
const financeController = require("./finance.controller");

// =========================================================
// ROUTES
// =========================================================

router.get("/cashier-shifts", financeController.getCashierShifts);
router.get("/cashier-shifts/:id", financeController.getCashierShiftById);
router.post("/cashier-shifts/:id/verify", financeController.verifyCashierShift);

module.exports = router;
