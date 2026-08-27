const express = require("express");

const router = express.Router();

const employeesController = require("./employees.controller");

router.get("/", employeesController.getEmployees);
router.get("/:id", employeesController.getEmployee);
router.post("/", employeesController.createEmployee);
router.put("/:id", employeesController.updateEmployee);
router.delete("/:id", employeesController.deleteEmployee);
router.put("/:id/activate", employeesController.activateEmployee);
module.exports = router;