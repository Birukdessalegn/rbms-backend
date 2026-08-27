const express = require("express");

const router = express.Router();

const leaveController = require("./leave.controller");

// Get all leave requests
router.get("/", leaveController.getLeaveRequests);

// Get one leave request
router.get("/:id", leaveController.getLeaveRequest);

// Create leave request
router.post("/", leaveController.createLeaveRequest);

// Manager approves
router.patch(
  "/:id/approve",
  leaveController.approveLeaveRequest
);

// Manager rejects
router.patch(
  "/:id/reject",
  leaveController.rejectLeaveRequest
);

module.exports = router;