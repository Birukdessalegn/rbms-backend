const express = require("express");
const router = express.Router();
const paymentAccountsController = require("./payment_accounts.controller");
const authenticate = require("../../middleware/auth.middleware");
const authorize = require("../../middleware/role.middleware");

// Authenticate all account routes
router.use(authenticate);

// List accounts (waiters/bartenders/cashiers can read active accounts; admins see all)
router.get("/", paymentAccountsController.getAccounts);
router.get("/:id", paymentAccountsController.getAccount);

// Manage accounts (Strictly restricted to Admin and Manager)
router.post("/", authorize("admin", "manager"), paymentAccountsController.createAccount);
router.put("/:id", authorize("admin", "manager"), paymentAccountsController.updateAccount);
router.delete("/:id", authorize("admin", "manager"), paymentAccountsController.deleteAccount);

module.exports = router;
