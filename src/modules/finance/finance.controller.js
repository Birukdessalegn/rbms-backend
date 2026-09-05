const financeService = require("./finance.service");

// =========================================================
// GET ALL CASHIER SHIFTS
// =========================================================

const getCashierShifts = async (req, res) => {
  try {
    const shifts = await financeService.getCashierShifts();

    return res.status(200).json({
      success: true,
      data: shifts,
    });
  } catch (error) {
    console.error("Error getting cashier shifts:", error);
    return res.status(500).json({
      success: false,
      message: "Server error fetching cashier shifts",
      error: error.message,
    });
  }
};


// =========================================================
// GET CASHIER SHIFT BY ID
// =========================================================

const getCashierShiftById = async (req, res) => {
  try {
    const { id } = req.params;
    const shift = await financeService.getCashierShiftById(id);

    if (!shift) {
      return res.status(404).json({
        success: false,
        message: "Cashier shift not found",
      });
    }

    return res.status(200).json({
      success: true,
      data: shift,
    });
  } catch (error) {
    console.error("Error getting cashier shift by id:", error);
    return res.status(500).json({
      success: false,
      message: "Server error fetching shift details",
      error: error.message,
    });
  }
};


// =========================================================
// VERIFY CASHIER SHIFT
// =========================================================

const verifyCashierShift = async (req, res) => {
  try {
    const { id } = req.params;
    const { status, notes, verification_notes, verificationNotes } = req.body;
    const verifiedBy = req.user?.id || null;
    const verifiedByName = req.user?.username || null;
    const auditNotes = verification_notes || verificationNotes || notes || null;

    if (!status) {
      return res.status(400).json({
        success: false,
        message: "Status is required ('verified' or 'discrepancy')",
      });
    }

    const updatedShift = await financeService.verifyCashierShift(
      id,
      status,
      auditNotes,
      verifiedBy,
      verifiedByName
    );

    if (!updatedShift) {
      return res.status(404).json({
        success: false,
        message: "Cashier shift record not found",
      });
    }

    return res.status(200).json({
      success: true,
      message: `Shift audit updated to ${status}`,
      data: updatedShift,
    });
  } catch (error) {
    console.error("Error verifying shift:", error);
    return res.status(500).json({
      success: false,
      message: "Server error updating shift verification",
      error: error.message,
    });
  }
};


// =========================================================
// EXPORT
// =========================================================

module.exports = {
  getCashierShifts,
  getCashierShiftById,
  verifyCashierShift,
};
