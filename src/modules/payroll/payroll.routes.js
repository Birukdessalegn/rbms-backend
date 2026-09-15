const express = require("express");
const router = express.Router();
const payrollController = require("./payroll.controller");
const authenticate = require("../../middleware/auth.middleware");
const authorize = require("../../middleware/role.middleware");

// Require authentication for all payroll routes
router.use(authenticate);

// Accessible by Admin, HR, and Finance
router.get("/summary", authorize("admin", "hr", "finance"), payrollController.getSummary);
router.post("/runs", authorize("admin", "hr", "finance"), payrollController.createRun);
router.get("/runs", authorize("admin", "hr", "finance"), payrollController.getRuns);

module.exports = router;
