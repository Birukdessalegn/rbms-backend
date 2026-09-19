const express = require("express");

const router = express.Router();

const {
  getTables,
  getTable,
  createTable,
  updateTable,
  updateTableStatus,
  deleteTable,
} = require("./table.controller");
const authenticate = require("../../middleware/auth.middleware");
const authorize = require("../../middleware/role.middleware");

// Require authentication for all table routes
router.use(authenticate);

// GET /api/tables
router.get("/", getTables);

// POST /api/tables
router.post("/", authorize("admin", "manager"), createTable);

// PUT /api/tables/:id/status
router.put("/:id/status", updateTableStatus);

// PUT /api/tables/:id
router.put("/:id", authorize("admin", "manager"), updateTable);

// DELETE /api/tables/:id
router.delete("/:id", authorize("admin", "manager"), deleteTable);

// GET /api/tables/:id
router.get("/:id", getTable);

module.exports = router;
