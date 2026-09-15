const express = require("express");
const router = express.Router();
const payrollController = require("./payroll.controller");
const authMiddleware = require("../../middleware/auth.middleware");
const authorize = require("../../middleware/role.middleware");

// Require valid authentication
router.use(authMiddleware);

// Restrict payroll viewing and calculation to HR, Finance, and Executive management
router.use(authorize("admin", "hr", "finance", "manager"));

router.get("/summary", payrollController.getSummary);
router.post("/runs", payrollController.saveRun);
router.get("/history", payrollController.getHistory);
router.get("/runs", payrollController.getHistory);

module.exports = router;
