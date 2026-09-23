const express = require("express");

const router = express.Router();

const purchasingController =
  require("./purchasing.controller");
const authenticate = require("../../middleware/auth.middleware");
const authorize = require("../../middleware/role.middleware");

// Require authentication for all purchasing routes
router.use(authenticate);

// ============================================================
// SUPPLIERS
// ============================================================

router.get(
  "/suppliers",
  purchasingController.getSuppliers
);

router.get(
  "/suppliers/:id",
  purchasingController.getSupplier
);

router.post(
  "/suppliers",
  authorize("admin", "manager", "finance", "purchasing"),
  purchasingController.createSupplier
);


// ============================================================
// PURCHASE ORDERS
// ============================================================

router.get(
  "/",
  purchasingController.getPurchases
);

router.get(
  "/:id",
  purchasingController.getPurchase
);

router.post(
  "/",
  authorize("admin", "manager", "finance", "purchasing"),
  purchasingController.createPurchase
);

router.put(
  "/:id",
  authorize("admin", "manager", "finance", "purchasing"),
  purchasingController.updatePurchase
);


// Receive purchase (storekeeper and purchasing can physically receive stock)
router.post(
  "/:id/receive",
  authorize("admin", "manager", "finance", "purchasing", "storekeeper"),
  purchasingController.receivePurchase
);


// Cancel purchase
router.post(
  "/:id/cancel",
  authorize("admin", "manager", "finance", "purchasing"),
  purchasingController.cancelPurchase
);


// Mark purchase as PAID
router.put(
  "/:id/pay",
  authorize("admin", "manager", "finance"),
  purchasingController.payPurchase
);


module.exports = router;
