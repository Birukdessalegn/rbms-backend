const express = require("express");

const router = express.Router();

const leaveController = require("./leave.controller");
const authenticate = require("../../middleware/auth.middleware");
const authorize = require("../../middleware/role.middleware");

// Require authentication for all leave routes
router.use(authenticate);

// Leave management is restricted to Admin and HR
router.use(authorize("admin", "hr"));

// Get all leave requests
router.get("/", leaveController.getLeaveRequests);

// Get leave types
router.get("/types", leaveController.getLeaveTypes);

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