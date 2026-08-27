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
  deleteTable, // <-- Add export here
};
