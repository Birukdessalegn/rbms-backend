const express = require("express");

const router = express.Router();

const purchasingController =
  require("./purchasing.controller");


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
  purchasingController.createPurchase
);

router.put(
  "/:id",
  purchasingController.updatePurchase
);


// Receive purchase
router.post(
  "/:id/receive",
  purchasingController.receivePurchase
);


// Cancel purchase
router.post(
  "/:id/cancel",
  purchasingController.cancelPurchase
);


// Mark purchase as PAID
router.put(
  "/:id/pay",
  purchasingController.payPurchase
);


module.exports = router;
