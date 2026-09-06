const tableService = require("./table.service");

// ============================================================
// GET ALL TABLES
// ============================================================

const getTables = async (req, res) => {
  try {
    const tables = await tableService.getAllTables();

    res.json({
      success: true,
      count: tables.length,
      tables,
    });
  } catch (error) {
    console.error("Get tables error:", error);

    res.status(500).json({
      success: false,
      message: "Failed to fetch tables",
    });
  }
};

// ============================================================
// GET ONE TABLE
// ============================================================

const getTable = async (req, res) => {
  try {
    const table = await tableService.getTableById(req.params.id);

    if (!table) {
      return res.status(404).json({
        success: false,
        message: "Table not found",
      });
    }

    res.json({
      success: true,
      table,
    });
  } catch (error) {
    console.error("Get table error:", error);

    res.status(500).json({
      success: false,
      message: "Failed to fetch table",
    });
  }
};

// ============================================================
// CREATE TABLE / BAR STOOL
// ============================================================

const createTable = async (req, res) => {
  try {
    const tableNumber = req.body.tableNumber || req.body.table_number;

    if (!tableNumber) {
      return res.status(400).json({
        success: false,
        message: "Table number is required",
      });
    }

    const table = await tableService.createTable(req.body);

    res.status(201).json({
      success: true,
      message: "Table created successfully",
      table,
    });
  } catch (error) {
    console.error("Create table error:", error);

    res.status(500).json({
      success: false,
      message: error.message || "Failed to create table",
    });
  }
};

// ============================================================
// UPDATE TABLE / BAR STOOL
// ============================================================

const updateTable = async (req, res) => {
  try {
    const table = await tableService.updateTable(req.params.id, req.body);

    if (!table) {
      return res.status(404).json({
        success: false,
        message: "Table not found",
      });
    }

    res.json({
      success: true,
      message: "Table updated successfully",
      table,
    });
  } catch (error) {
    console.error("Update table error:", error);

    res.status(500).json({
      success: false,
      message: error.message || "Failed to update table",
    });
  }
};

// ============================================================
// UPDATE TABLE STATUS (e.g. occupied, available)
// ============================================================

const updateTableStatus = async (req, res) => {
  try {
    const { status, waiterId, waiter_id } = req.body;

    if (!status) {
      return res.status(400).json({
        success: false,
        message: "Status is required",
      });
    }

    const effectiveWaiterId = waiterId || waiter_id || (req.user ? req.user.id : null);
    const table = await tableService.updateTableStatus(
      req.params.id,
      status,
      effectiveWaiterId
    );

    if (!table) {
      return res.status(404).json({
        success: false,
        message: "Table not found",
      });
    }

    res.json({
      success: true,
      message: "Table status updated successfully",
      table,
    });
  } catch (error) {
    console.error("Update table status error:", error);

    res.status(500).json({
      success: false,
      message: error.message || "Failed to update table status",
    });
  }
};

// ============================================================
// DELETE TABLE
// ============================================================

const deleteTable = async (req, res) => {
  try {
    const { id } = req.params;
    const deletedTable = await tableService.deleteTable(id);

    if (!deletedTable) {
      return res.status(404).json({
        success: false,
        message: "Table not found",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Table deleted successfully",
      table: deletedTable,
    });
  } catch (error) {
    console.error("Failed to delete table:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to delete table",
      error: error.message,
    });
  }
};

module.exports = {
  getTables,
  getTable,
  createTable,
  updateTable,
  updateTableStatus,
  deleteTable,
};
