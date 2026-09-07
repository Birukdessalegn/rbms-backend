const express = require("express");
const router = express.Router();
const employeesController = require("./employees.controller");
const authenticate = require("../../middleware/auth.middleware");
const authorize = require("../../middleware/role.middleware");

// Require authentication for employee routes
router.use(authenticate);

router.get("/", employeesController.getEmployees);
router.get("/:id", employeesController.getEmployee);

// Only Admin (acting as HR) or designated HR role can create, edit, delete, or manage accounts
router.post("/", authorize("admin", "hr"), employeesController.createEmployee);
router.put("/:id", authorize("admin", "hr"), employeesController.updateEmployee);
router.delete("/:id", authorize("admin", "hr"), employeesController.deleteEmployee);
router.put("/:id/activate", authorize("admin", "hr"), employeesController.activateEmployee);
router.delete("/:id/login-account", authorize("admin", "hr"), employeesController.deleteEmployeeAccount);

module.exports = router;