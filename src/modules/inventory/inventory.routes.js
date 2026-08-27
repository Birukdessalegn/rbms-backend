const express = require("express");

const router = express.Router();

const inventoryController = require("./inventory.controller");


// Low stock
router.get(
  "/low-stock",
  inventoryController.getLowStock
);


// All inventory
router.get(
  "/",
  inventoryController.getInventory
);


// Create inventory
router.post(
  "/",
  inventoryController.createInventory
);


// Stock in
router.post(
  "/stock-in",
  inventoryController.stockIn
);


// Stock out
router.post(
  "/stock-out",
  inventoryController.stockOut
);


// Product inventory
router.get(
  "/product/:productId",
  inventoryController.getInventoryByProduct
);


// Update inventory settings
router.put(
  "/product/:productId",
  inventoryController.updateInventory
);


// Inventory transactions
router.get(
  "/product/:productId/transactions",
  inventoryController.getTransactions
);


module.exports = router;