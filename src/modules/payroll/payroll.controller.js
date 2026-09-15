const payrollService = require("./payroll.service");

const getSummary = async (req, res) => {
  try {
    const { month } = req.query;
    const summary = await payrollService.getPayrollSummary(month);
    res.json({ success: true, data: summary });
  } catch (error) {
    console.error("Payroll summary error:", error);
    res.status(500).json({ success: false, message: error.message });
  }
};

const saveRun = async (req, res) => {
  try {
    const { periodMonth, items, notes, status } = req.body;
    if (!periodMonth || !Array.isArray(items)) {
      return res.status(400).json({ success: false, message: "Period month and items array are required" });
    }
    const processedBy = req.user?.id || null;
    const result = await payrollService.savePayrollRun({
      periodMonth,
      items,
      notes,
      processedBy,
      status: status || "approved"
    });
    res.status(201).json({ success: true, data: result });
  } catch (error) {
    console.error("Save payroll run error:", error);
    res.status(400).json({ success: false, message: error.message });
  }
};

const getHistory = async (req, res) => {
  try {
    const history = await payrollService.getPayrollHistory();
    res.json({ success: true, data: history });
  } catch (error) {
    console.error("Payroll history error:", error);
    res.status(500).json({ success: false, message: error.message });
  }
};

module.exports = {
  getSummary,
  saveRun,
  createRun: saveRun,
  getHistory,
  getRuns: getHistory
};
