const express = require("express");
const router = express.Router();
const financeController = require("./finance.controller");
const authenticate = require("../../middleware/auth.middleware");
const authorize = require("../../middleware/role.middleware");

// =========================================================
// CASHIER SHIFT RECONCILIATION ROUTES
// =========================================================

router.get(
  "/cashier-shifts",
  authenticate,
  authorize("admin", "manager", "finance", "cashier"),
  financeController.getCashierShifts
);

router.get(
  "/cashier-shifts/:id",
  authenticate,
  authorize("admin", "manager", "finance", "cashier"),
  financeController.getCashierShiftById
);

router.post(
  "/cashier-shifts/:id/verify",
  authenticate,
  authorize("admin", "manager", "finance"),
  financeController.verifyCashierShift
);

// =========================================================
// COST ANALYSIS & MENU ENGINEERING ROUTES
// =========================================================

router.get(
  "/cost-analysis",
  authenticate,
  authorize("admin", "manager", "finance"),
  financeController.getCostAnalysis
);

router.patch(
  "/cost-analysis/product/:id/cost",
  authenticate,
  authorize("admin", "manager", "finance"),
  financeController.updateProductCost
);

module.exports = router;
