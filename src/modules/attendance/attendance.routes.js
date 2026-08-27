const express = require("express");

const router = express.Router();

const attendanceController = require("./attendance.controller");

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

module.exports = router;