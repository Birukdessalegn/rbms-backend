const express = require("express");
const router = express.Router();

const inventoryController = require("./inventory.controller");
const transfersController = require("./transfers.controller");
const authenticate = require("../../middleware/auth.middleware");

// Optional auth helper so unauthenticated calls work if needed, but attached req.user if token is present
const optionalAuth = (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith("Bearer ")) {
    return authenticate(req, res, next);
  }
  next();
};

// ============================================================
// MULTI-LOCATION MATRIX & LOW STOCK
// ============================================================

// Combined Multi-Location Matrix (Main Store vs Bar vs Kitchen)
router.get("/multi-location", inventoryController.getMultiLocationInventory);

// Low stock (query param ?location=main|bar|kitchen|all)
router.get("/low-stock", inventoryController.getLowStock);

// Department inventory (/departments/bar or /departments/kitchen)
router.get("/departments/:department", inventoryController.getDepartmentInventory);
router.put("/departments/:department/product/:productId", inventoryController.updateDepartmentStockSettings);

// ============================================================
// STOCK TRANSFERS & REQUISITIONS
// ============================================================

router.post("/transfers", optionalAuth, transfersController.createTransfer);
router.post("/transfers/request", optionalAuth, transfersController.requestTransfer);
router.get("/transfers", transfersController.getTransfers);
router.get("/transfers/:id", transfersController.getTransferById);
router.put("/transfers/:id/approve", optionalAuth, transfersController.approveTransfer);
router.put("/transfers/:id/reject", optionalAuth, transfersController.rejectTransfer);

// ============================================================
// CENTRAL / MAIN INVENTORY
// ============================================================

// All central inventory
router.get("/", inventoryController.getInventory);

// Create inventory
router.post("/", inventoryController.createInventory);

// Stock in
router.post("/stock-in", optionalAuth, inventoryController.stockIn);

// Stock out
router.post("/stock-out", optionalAuth, inventoryController.stockOut);

// Product inventory
router.get("/product/:productId", inventoryController.getInventoryByProduct);

// Update inventory settings
router.put("/product/:productId", inventoryController.updateInventory);

// Inventory transactions
router.get("/product/:productId/transactions", inventoryController.getTransactions);

module.exports = router;