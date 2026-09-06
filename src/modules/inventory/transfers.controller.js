const transfersService = require("./transfers.service");

// ============================================================
// CREATE DIRECT TRANSFER
// ============================================================

const createTransfer = async (req, res) => {
  try {
    const { fromLocation, toLocation, items, notes } = req.body;
    const userId = req.user?.id || null;

    if (!toLocation) {
      return res.status(400).json({
        success: false,
        message: "Destination location ('bar' or 'kitchen') is required.",
      });
    }

    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({
        success: false,
        message: "Items array is required.",
      });
    }

    const transfer = await transfersService.createTransfer({
      fromLocation: fromLocation || "main",
      toLocation,
      items,
      notes,
      userId,
    });

    return res.status(201).json({
      success: true,
      message: `Stock transferred successfully to ${toLocation.toUpperCase()}`,
      data: transfer,
    });
  } catch (error) {
    console.error("CREATE TRANSFER ERROR:", error);
    return res.status(400).json({
      success: false,
      message: error.message || "Failed to create transfer",
    });
  }
};

// ============================================================
// REQUEST TRANSFER (REQUISITION)
// ============================================================

const requestTransfer = async (req, res) => {
  try {
    const { toLocation, items, notes } = req.body;
    const userId = req.user?.id || null;

    if (!toLocation) {
      return res.status(400).json({
        success: false,
        message: "Department ('bar' or 'kitchen') is required.",
      });
    }

    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({
        success: false,
        message: "Items array is required.",
      });
    }

    const transfer = await transfersService.requestTransfer({
      toLocation,
      items,
      notes,
      userId,
    });

    return res.status(201).json({
      success: true,
      message: "Stock requisition request submitted successfully",
      data: transfer,
    });
  } catch (error) {
    console.error("REQUEST TRANSFER ERROR:", error);
    return res.status(400).json({
      success: false,
      message: error.message || "Failed to request transfer",
    });
  }
};

// ============================================================
// GET ALL TRANSFERS
// ============================================================

const getTransfers = async (req, res) => {
  try {
    const { status, toLocation, fromLocation, limit } = req.query;

    const transfers = await transfersService.getTransfers({
      status,
      toLocation,
      fromLocation,
      limit: limit ? parseInt(limit, 10) : 50,
    });

    return res.status(200).json({
      success: true,
      data: transfers,
    });
  } catch (error) {
    console.error("GET TRANSFERS ERROR:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to get transfers",
    });
  }
};

// ============================================================
// GET TRANSFER BY ID
// ============================================================

const getTransferById = async (req, res) => {
  try {
    const { id } = req.params;

    const transfer = await transfersService.getTransferById(id);

    if (!transfer) {
      return res.status(404).json({
        success: false,
        message: "Transfer not found",
      });
    }

    return res.status(200).json({
      success: true,
      data: transfer,
    });
  } catch (error) {
    console.error("GET TRANSFER BY ID ERROR:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to get transfer",
    });
  }
};

// ============================================================
// APPROVE TRANSFER (F&B CONTROLLER)
// ============================================================

const approveTransfer = async (req, res) => {
  try {
    const role = String(req.user?.role || "").toLowerCase();
    if (role === "chef" || role === "waiter" || role === "bartender") {
      return res.status(403).json({
        success: false,
        message: "Access denied: Kitchen staff cannot approve or reject their own restock requisitions.",
      });
    }

    const { id } = req.params;
    const { notes } = req.body;
    const userId = req.user?.id || null;

    const transfer = await transfersService.approveTransfer(id, {
      userId,
      notes,
    });

    return res.status(200).json({
      success: true,
      message: "Transfer approved and inventory dispatched successfully",
      data: transfer,
    });
  } catch (error) {
    console.error("APPROVE TRANSFER ERROR:", error);
    return res.status(400).json({
      success: false,
      message: error.message || "Failed to approve transfer",
    });
  }
};

// ============================================================
// REJECT TRANSFER (F&B CONTROLLER)
// ============================================================

const rejectTransfer = async (req, res) => {
  try {
    const role = String(req.user?.role || "").toLowerCase();
    if (role === "chef" || role === "waiter" || role === "bartender") {
      return res.status(403).json({
        success: false,
        message: "Access denied: Kitchen staff cannot approve or reject their own restock requisitions.",
      });
    }

    const { id } = req.params;
    const { notes } = req.body;
    const userId = req.user?.id || null;

    const transfer = await transfersService.rejectTransfer(id, {
      userId,
      notes,
    });

    return res.status(200).json({
      success: true,
      message: "Transfer requisition rejected",
      data: transfer,
    });
  } catch (error) {
    console.error("REJECT TRANSFER ERROR:", error);
    return res.status(400).json({
      success: false,
      message: error.message || "Failed to reject transfer",
    });
  }
};

module.exports = {
  createTransfer,
  requestTransfer,
  approveTransfer,
  rejectTransfer,
  getTransfers,
  getTransferById,
};
