const express = require("express");
const router = express.Router();
const paymentAccountsController = require("./payment_accounts.controller");
const authenticate = require("../../middleware/auth.middleware");

// Authenticate all account routes
router.use(authenticate);

// List accounts (waiters/bartenders can read active accounts; admins see all)
router.get("/", paymentAccountsController.getAccounts);
router.get("/:id", paymentAccountsController.getAccount);

// Manage accounts (Admin / Manager)
router.post("/", paymentAccountsController.createAccount);
router.put("/:id", paymentAccountsController.updateAccount);
router.delete("/:id", paymentAccountsController.deleteAccount);

module.exports = router;
