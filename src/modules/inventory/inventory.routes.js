const express = require("express");
const router = express.Router();

const inventoryController = require("./inventory.controller");
const transfersController = require("./transfers.controller");
const authenticate = require("../../middleware/auth.middleware");
const authorize = require("../../middleware/role.middleware");

// Require authentication for all inventory endpoints
router.use(authenticate);

// ============================================================
// MULTI-LOCATION MATRIX & LOW STOCK
// ============================================================

// Combined Multi-Location Matrix (Main Store vs Bar vs Kitchen)
router.get("/multi-location", inventoryController.getMultiLocationInventory);

// Low stock (query param ?location=main|bar|kitchen|all)
router.get("/low-stock", inventoryController.getLowStock);

// Department inventory (/departments/bar or /departments/kitchen)
router.get("/departments/:department", inventoryController.getDepartmentInventory);
router.put(
  "/departments/:department/product/:productId",
  authorize("admin", "manager", "fb_controller"),
  inventoryController.updateDepartmentStockSettings
);

// ============================================================
// STOCK TRANSFERS & REQUISITIONS
// ============================================================

router.post("/transfers", transfersController.createTransfer);
router.post("/transfers/request", transfersController.requestTransfer);
router.get("/transfers", transfersController.getTransfers);
router.get("/transfers/:id", transfersController.getTransferById);
router.put(
  "/transfers/:id/approve",
  authorize("admin", "manager", "fb_controller", "finance"),
  transfersController.approveTransfer
);
router.put(
  "/transfers/:id/reject",
  authorize("admin", "manager", "fb_controller", "finance"),
  transfersController.rejectTransfer
);
router.put("/transfers/:id/receive", transfersController.receiveTransfer);

// ============================================================
// CENTRAL / MAIN INVENTORY
// ============================================================

// All central inventory
router.get("/", inventoryController.getInventory);

// Create inventory
router.post(
  "/",
  authorize("admin", "manager", "fb_controller", "finance"),
  inventoryController.createInventory
);

// Stock in
router.post(
  "/stock-in",
  authorize("admin", "manager", "fb_controller", "finance"),
  inventoryController.stockIn
);

// Stock out
router.post(
  "/stock-out",
  authorize("admin", "manager", "fb_controller", "finance"),
  inventoryController.stockOut
);

// Product inventory
router.get("/product/:productId", inventoryController.getInventoryByProduct);

// Update inventory settings
router.put(
  "/product/:productId",
  authorize("admin", "manager", "fb_controller"),
  inventoryController.updateInventory
);

// Inventory transactions
router.get("/product/:productId/transactions", inventoryController.getTransactions);

module.exports = router;