const express = require("express");

const router = express.Router();

const attendanceController = require("./attendance.controller");
const authenticate = require("../../middleware/auth.middleware");

router.use(authenticate);

router.get("/", attendanceController.getAttendance);

router.get(
  "/today",
  attendanceController.getTodayAttendance
);

router.get(
  "/employee/:employeeId",
  attendanceController.getEmployeeAttendance
);

router.post(
  "/check-in",
  attendanceController.checkIn
);

router.put(
  "/check-out/:employeeId",
  attendanceController.checkOut
);

router.post(
  "/",
  attendanceController.createAttendance
);

router.post(
  "/auto-mark",
  attendanceController.triggerAutoMark
);

module.exports = router;