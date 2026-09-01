const express = require("express");

const router = express.Router();

const kitchenController = require("./kitchen.controller");

// Get all kitchen orders (support both / and /orders)
router.get("/", kitchenController.getKitchenOrders);
router.get("/orders", kitchenController.getKitchenOrders);

// Get single kitchen order (support /orders/:id and /:id)
router.get("/orders/:id", kitchenController.getKitchenOrder);
router.get("/:id", kitchenController.getKitchenOrder);

// Create kitchen order (support / and /orders)
router.post("/", kitchenController.createKitchenOrder);
router.post("/orders", kitchenController.createKitchenOrder);

// Update status (support /orders/:id/status and /:id/status)
router.put("/orders/:id/status", kitchenController.updateKitchenOrderStatus);
router.put("/:id/status", kitchenController.updateKitchenOrderStatus);

// Delete kitchen order (support /orders/:id and /:id)
router.delete("/orders/:id", kitchenController.deleteKitchenOrder);
router.delete("/:id", kitchenController.deleteKitchenOrder);

module.exports = router;