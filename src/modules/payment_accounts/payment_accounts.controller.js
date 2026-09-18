const paymentAccountsService = require("./payment_accounts.service");

// ============================================================
// GET ALL ACCOUNTS
// ============================================================
const getAccounts = async (req, res) => {
  try {
    const onlyActive = req.query.active === "true" || req.query.active === "1";
    const accounts = await paymentAccountsService.getAllAccounts(onlyActive);

    res.json({
      success: true,
      count: accounts.length,
      accounts,
      data: accounts,
    });
  } catch (error) {
    console.error("Get payment accounts error:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Failed to fetch payment accounts",
    });
  }
};

// ============================================================
// GET ONE ACCOUNT
// ============================================================
const getAccount = async (req, res) => {
  try {
    const account = await paymentAccountsService.getAccountById(req.params.id);
    if (!account) {
      return res.status(404).json({
        success: false,
        message: "Payment account not found",
      });
    }

    res.json({
      success: true,
      account,
      data: account,
    });
  } catch (error) {
    console.error("Get payment account error:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Failed to fetch payment account",
    });
  }
};

// ============================================================
// CREATE ACCOUNT (Admin / Manager)
// ============================================================
const createAccount = async (req, res) => {
  try {
    const account = await paymentAccountsService.createAccount(req.body);

    res.status(201).json({
      success: true,
      message: "Payment account created successfully",
      account,
      data: account,
    });
  } catch (error) {
    console.error("Create payment account error:", error);
    res.status(400).json({
      success: false,
      message: error.message || "Failed to create payment account",
    });
  }
};

// ============================================================
// UPDATE ACCOUNT (Admin / Manager)
// ============================================================
const updateAccount = async (req, res) => {
  try {
    const account = await paymentAccountsService.updateAccount(req.params.id, req.body);

    res.json({
      success: true,
      message: "Payment account updated successfully",
      account,
      data: account,
    });
  } catch (error) {
    console.error("Update payment account error:", error);
    res.status(400).json({
      success: false,
      message: error.message || "Failed to update payment account",
    });
  }
};

// ============================================================
// DELETE ACCOUNT (Admin / Manager)
// ============================================================
const deleteAccount = async (req, res) => {
  try {
    const result = await paymentAccountsService.deleteAccount(req.params.id);
    if (!result) {
      return res.status(404).json({
        success: false,
        message: "Payment account not found",
      });
    }

    res.json({
      success: true,
      message: "Payment account deleted successfully",
    });
  } catch (error) {
    console.error("Delete payment account error:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Failed to delete payment account",
    });
  }
};

module.exports = {
  getAccounts,
  getAccount,
  createAccount,
  updateAccount,
  deleteAccount,
};
