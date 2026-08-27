const leaveService = require("./leave.service");

// ============================================================
// GET ALL LEAVE REQUESTS
// ============================================================

const getLeaveRequests = async (req, res) => {
  try {
    const leaveRequests = await leaveService.getAllLeaveRequests();

    res.json({
      success: true,
      count: leaveRequests.length,
      leaveRequests,
    });
  } catch (error) {
    console.error("Get leave requests error:", error);

    res.status(500).json({
      success: false,
      message: "Failed to fetch leave requests",
    });
  }
};


// ============================================================
// GET LEAVE REQUEST
// ============================================================

const getLeaveRequest = async (req, res) => {
  try {
    const leaveRequest =
      await leaveService.getLeaveRequestById(req.params.id);

    if (!leaveRequest) {
      return res.status(404).json({
        success: false,
        message: "Leave request not found",
      });
    }

    res.json({
      success: true,
      leaveRequest,
    });
  } catch (error) {
    console.error("Get leave request error:", error);

    res.status(500).json({
      success: false,
      message: "Failed to fetch leave request",
    });
  }
};


// ============================================================
// CREATE LEAVE REQUEST
// ============================================================

const createLeaveRequest = async (req, res) => {
  try {
    const {
      employeeId,
      startDate,
      endDate,
      totalDays,
    } = req.body;

    if (
      !employeeId ||
      !startDate ||
      !endDate ||
      !totalDays
    ) {
      return res.status(400).json({
        success: false,
        message:
          "Employee, start date, end date and total days are required",
      });
    }

    const leaveRequest =
      await leaveService.createLeaveRequest(req.body);

    res.status(201).json({
      success: true,
      message: "Leave request created successfully",
      leaveRequest,
    });
  } catch (error) {
    console.error("Create leave request error:", error);

    res.status(500).json({
      success: false,
      message: "Failed to create leave request",
    });
  }
};


// ============================================================
// APPROVE LEAVE REQUEST
// ============================================================

const approveLeaveRequest = async (req, res) => {
  try {
    const {
      reviewedBy,
      managerComment,
    } = req.body;

    const leaveRequest =
      await leaveService.approveLeaveRequest(
        req.params.id,
        reviewedBy,
        managerComment
      );

    if (!leaveRequest) {
      return res.status(404).json({
        success: false,
        message:
          "Leave request not found or has already been reviewed",
      });
    }

    res.json({
      success: true,
      message: "Leave request approved successfully",
      leaveRequest,
    });
  } catch (error) {
    console.error("Approve leave request error:", error);

    res.status(500).json({
      success: false,
      message: "Failed to approve leave request",
    });
  }
};


// ============================================================
// REJECT LEAVE REQUEST
// ============================================================

const rejectLeaveRequest = async (req, res) => {
  try {
    const {
      reviewedBy,
      managerComment,
    } = req.body;

    if (!managerComment) {
      return res.status(400).json({
        success: false,
        message: "Please provide a reason for rejection",
      });
    }

    const leaveRequest =
      await leaveService.rejectLeaveRequest(
        req.params.id,
        reviewedBy,
        managerComment
      );

    if (!leaveRequest) {
      return res.status(404).json({
        success: false,
        message:
          "Leave request not found or has already been reviewed",
      });
    }

    res.json({
      success: true,
      message: "Leave request rejected successfully",
      leaveRequest,
    });
  } catch (error) {
    console.error("Reject leave request error:", error);

    res.status(500).json({
      success: false,
      message: "Failed to reject leave request",
    });
  }
};


module.exports = {
  getLeaveRequests,
  getLeaveRequest,
  createLeaveRequest,
  approveLeaveRequest,
  rejectLeaveRequest,
};