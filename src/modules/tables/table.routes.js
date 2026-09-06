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

// GET /api/tables
router.get("/", getTables);

// POST /api/tables
router.post("/", createTable);

// PUT /api/tables/:id/status
router.put("/:id/status", updateTableStatus);

// PUT /api/tables/:id
router.put("/:id", updateTable);

// DELETE /api/tables/:id
router.delete("/:id", deleteTable);

// GET /api/tables/:id
router.get("/:id", getTable);

module.exports = router;
