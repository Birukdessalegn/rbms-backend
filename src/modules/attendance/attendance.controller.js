const attendanceService = require("./attendance.service");

// GET /api/attendance
const getAttendance = async (req, res) => {
  try {
    const attendance = await attendanceService.getAllAttendance(req.query);

    res.json({
      success: true,
      count: attendance.length,
      attendance,
    });
  } catch (error) {
    console.error("Get attendance error:", error);

    res.status(500).json({
      success: false,
      message: "Failed to fetch attendance",
    });
  }
};

// GET /api/attendance/today
const getTodayAttendance = async (req, res) => {
  try {
    const attendance =
      await attendanceService.getTodayAttendance();

    res.json({
      success: true,
      count: attendance.length,
      attendance,
    });
  } catch (error) {
    console.error("Get today's attendance error:", error);

    res.status(500).json({
      success: false,
      message: "Failed to fetch today's attendance",
      error: error.message || String(error),
    });
  }
};

// GET /api/attendance/employee/:employeeId
const getEmployeeAttendance = async (req, res) => {
  try {
    const attendance =
      await attendanceService.getEmployeeAttendance(
        req.params.employeeId
      );

    res.json({
      success: true,
      count: attendance.length,
      attendance,
    });
  } catch (error) {
    console.error("Get employee attendance error:", error);

    res.status(500).json({
      success: false,
      message: "Failed to fetch employee attendance",
    });
  }
};

// POST /api/attendance/check-in
const checkIn = async (req, res) => {
  try {
    const { employeeId, notes } = req.body;

    if (!employeeId) {
      return res.status(400).json({
        success: false,
        message: "Employee ID is required",
      });
    }

    const attendance = await attendanceService.checkIn(
      employeeId,
      notes
    );

    res.status(201).json({
      success: true,
      message: "Employee checked in successfully",
      attendance,
    });
  } catch (error) {
    console.error("Check-in error:", error);

    res.status(500).json({
      success: false,
      message: "Failed to check in employee",
    });
  }
};

// PUT /api/attendance/check-out/:employeeId
const checkOut = async (req, res) => {
  try {
    const attendance =
      await attendanceService.checkOut(req.params.employeeId);

    if (!attendance) {
      return res.status(404).json({
        success: false,
        message: "No attendance record found for today",
      });
    }

    res.json({
      success: true,
      message: "Employee checked out successfully",
      attendance,
    });
  } catch (error) {
    console.error("Check-out error:", error);

    res.status(500).json({
      success: false,
      message: "Failed to check out employee",
    });
  }
};

// POST /api/attendance
const createAttendance = async (req, res) => {
  try {
    const {
      employeeId,
      attendanceDate,
      status,
    } = req.body;

    if (!employeeId || !attendanceDate || !status) {
      return res.status(400).json({
        success: false,
        message:
          "Employee ID, attendance date and status are required",
      });
    }

    const attendance =
      await attendanceService.createAttendance(req.body);

    res.status(201).json({
      success: true,
      message: "Attendance created successfully",
      attendance,
    });
  } catch (error) {
    console.error("Create attendance error:", error);

    res.status(500).json({
      success: false,
      message: "Failed to create attendance",
    });
  }
};

module.exports = {
  getAttendance,
  getTodayAttendance,
  getEmployeeAttendance,
  checkIn,
  checkOut,
  createAttendance,
};