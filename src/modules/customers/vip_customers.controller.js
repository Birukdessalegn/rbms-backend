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
    const receivedBy = req.user?.id || req.body.receivedBy || null;
    const result = await vipService.recordRepayment(req.params.id, req.body, receivedBy);
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

const getVipCustomer = async (req, res) => {
  try {
    const customer = await vipService.getVipCustomerById(req.params.id);
    if (!customer) {
      return res.status(404).json({ success: false, message: "VIP Customer not found" });
    }
    res.json({ success: true, data: customer });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

const getVipCustomerPayments = async (req, res) => {
  try {
    const payments = await vipService.getVipCustomerPayments(req.params.id);
    res.json({ success: true, count: payments.length, data: payments });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

const getVipCustomerRepayments = async (req, res) => {
  try {
    const repayments = await vipService.getVipCustomerRepayments(req.params.id);
    res.json({ success: true, count: repayments.length, data: repayments });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

const getVipCustomerTransactions = async (req, res) => {
  try {
    const transactions = await vipService.getVipCustomerTransactions(req.params.id);
    res.json({ success: true, count: transactions.length, data: transactions });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

module.exports = {
  getVipCustomers,
  getVipCustomer,
  createVipCustomer,
  updateVipCustomer,
  recordRepayment,
  deleteVipCustomer,
  getVipCustomerPayments,
  getVipCustomerRepayments,
  getVipCustomerTransactions,
};
