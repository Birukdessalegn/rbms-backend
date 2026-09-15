const payrollService = require("./payroll.service");

// GET /api/payroll/summary?month=YYYY-MM
const getSummary = async (req, res) => {
  try {
    const { month } = req.query;
    const summary = await payrollService.getPayrollSummary(month);

    return res.json({
      success: true,
      data: summary,
    });
  } catch (error) {
    console.error("GET PAYROLL SUMMARY ERROR:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to load payroll summary",
    });
  }
};

// POST /api/payroll/runs
const createRun = async (req, res) => {
  try {
    const { periodMonth, items, notes } = req.body;
    const userId = req.user?.id || null;

    if (!periodMonth) {
      return res.status(400).json({
        success: false,
        message: "periodMonth is required",
      });
    }

    const result = await payrollService.approvePayrollRun({
      periodMonth,
      items,
      notes,
      userId,
    });

    return res.status(201).json({
      success: true,
      message: `Payroll for ${periodMonth} approved and locked successfully`,
      data: result,
    });
  } catch (error) {
    console.error("APPROVE PAYROLL ERROR:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to approve payroll run",
    });
  }
};

// GET /api/payroll/runs
const getRuns = async (req, res) => {
  try {
    const runs = await payrollService.getPayrollRuns();

    return res.json({
      success: true,
      data: runs,
    });
  } catch (error) {
    console.error("GET PAYROLL RUNS ERROR:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to fetch payroll runs",
    });
  }
};

module.exports = {
  getSummary,
  createRun,
  getRuns,
};
