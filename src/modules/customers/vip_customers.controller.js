const vipService = require("./vip_customers.service");

const getVipCustomers = async (req, res) => {
  try {
    const customers = await vipService.getAllVipCustomers();
    res.json({ success: true, data: customers });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

const createVipCustomer = async (req, res) => {
  try {
    const customer = await vipService.createVipCustomer(req.body);
    res.status(201).json({ success: true, data: customer });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

const updateVipCustomer = async (req, res) => {
  try {
    const customer = await vipService.updateVipCustomer(req.params.id, req.body);
    res.json({ success: true, data: customer });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

const recordRepayment = async (req, res) => {
  try {
    const result = await vipService.recordRepayment(req.params.id, req.body);
    res.json({ success: true, message: "Repayment recorded", data: result });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

const deleteVipCustomer = async (req, res) => {
  try {
    await vipService.deleteVipCustomer(req.params.id);
    res.json({ success: true, message: "VIP customer deleted" });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

module.exports = {
  getVipCustomers,
  createVipCustomer,
  updateVipCustomer,
  recordRepayment,
  deleteVipCustomer,
};
