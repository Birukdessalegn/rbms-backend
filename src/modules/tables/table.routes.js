const express = require("express");

const router = express.Router();

const {
  getTables,
  getTable,
  deleteTable,
} = require("./table.controller");

// GET /api/tables
router.get("/", getTables);

// DELETE /api/tables/:id
router.delete("/:id", deleteTable);

// GET /api/tables/:id
router.get("/:id", getTable);

module.exports = router;
