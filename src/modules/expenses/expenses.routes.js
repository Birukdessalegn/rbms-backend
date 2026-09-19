const express = require("express");

const router = express.Router();

const expensesController = require("./expenses.controller");
const authenticate = require("../../middleware/auth.middleware");
const authorize = require("../../middleware/role.middleware");

// Require authentication and management/finance role for all expense operations
router.use(authenticate);
router.use(authorize("admin", "manager", "finance"));


// Categories
router.get(
  "/categories",
  expensesController.getExpenseCategories
);


// Summary
router.get(
  "/summary",
  expensesController.getExpenseSummary
);


// All expenses
router.get(
  "/",
  expensesController.getExpenses
);


// Recurring expenses
router.get(
  "/recurring",
  expensesController.getRecurringExpenses
);

router.post(
  "/recurring",
  expensesController.createRecurringExpense
);

router.post(
  "/recurring/check-due",
  expensesController.triggerRecurringNotifications
);

router.get(
  "/recurring/:id",
  expensesController.getRecurringExpense
);

router.put(
  "/recurring/:id",
  expensesController.updateRecurringExpense
);

router.delete(
  "/recurring/:id",
  expensesController.deleteRecurringExpense
);

router.post(
  "/recurring/:id/pay",
  expensesController.payRecurringExpense
);


// Single expense
router.get(
  "/:id",
  expensesController.getExpense
);


// Create
router.post(
  "/",
  expensesController.createExpense
);


// Update
router.put(
  "/:id",
  expensesController.updateExpense
);


// Delete
router.delete(
  "/:id",
  expensesController.deleteExpense
);


module.exports = router;