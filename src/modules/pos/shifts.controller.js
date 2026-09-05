const shiftsService = require("./shifts.service");

// ============================================================
// GET CURRENT SHIFT FOR LOGGED-IN CASHIER
// ============================================================
const getCurrentShift = async (req, res) => {
  try {
    const cashierId = req.user?.id;
    if (!cashierId) {
      return res.status(401).json({
        success: false,
        message: "Authentication required",
      });
    }

    const shift = await shiftsService.getCurrentShift(cashierId);

    return res.json({
      success: true,
      shift,
    });
  } catch (error) {
    console.error("Error getting current cashier shift:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to fetch current shift",
    });
  }
};

// ============================================================
// START NEW SHIFT
// ============================================================
const startShift = async (req, res) => {
  try {
    const cashierId = req.user?.id;
    if (!cashierId) {
      return res.status(401).json({
        success: false,
        message: "Authentication required",
      });
    }

    const shift = await shiftsService.startShift(cashierId, req.body);

    return res.status(201).json({
      success: true,
      message: "Shift started successfully",
      shift,
    });
  } catch (error) {
    console.error("Error starting shift:", error);
    const statusCode = error.message && error.message.includes("already have an active") ? 400 : 500;
    return res.status(statusCode).json({
      success: false,
      message: error.message || "Failed to start shift",
    });
  }
};

// ============================================================
// CLOSE CURRENT SHIFT
// ============================================================
const closeShift = async (req, res) => {
  try {
    const cashierId = req.user?.id;
    if (!cashierId) {
      return res.status(401).json({
        success: false,
        message: "Authentication required",
      });
    }

    const shift = await shiftsService.closeShift(cashierId, req.body);

    return res.json({
      success: true,
      message: "Shift closed successfully. Awaiting finance verification.",
      shift,
    });
  } catch (error) {
    console.error("Error closing shift:", error);
    const statusCode = error.message && (error.message.includes("required") || error.message.includes("No active")) ? 400 : 500;
    return res.status(statusCode).json({
      success: false,
      message: error.message || "Failed to close shift",
    });
  }
};

module.exports = {
  getCurrentShift,
  startShift,
  closeShift,
};
