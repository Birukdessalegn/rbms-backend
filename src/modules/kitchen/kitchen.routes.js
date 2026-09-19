const express = require("express");

const router = express.Router();

const kitchenController = require("./kitchen.controller");
const authenticate = require("../../middleware/auth.middleware");
const authorize = require("../../middleware/role.middleware");

// Require authentication for all kitchen and stock audit endpoints
router.use(authenticate);

// Kitchen & Bar stock audit & verification endpoints
router.get("/audits", kitchenController.getKitchenAudits);
router.post("/audit", kitchenController.verifyKitchenStock);

// F&B Stock shortage & discrepancy requests (all outlets: kitchen, bar, fruit)
router.get("/shortages", kitchenController.getShortageRequests);
router.post("/shortages", kitchenController.createShortageRequest);
router.put(
  "/shortages/:id/review",
  authorize("admin", "manager", "fb_controller"),
  kitchenController.reviewShortageRequest
);

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
router.delete("/orders/:id", authorize("admin", "manager", "chef"), kitchenController.deleteKitchenOrder);
router.delete("/:id", authorize("admin", "manager", "chef"), kitchenController.deleteKitchenOrder);

module.exports = router;