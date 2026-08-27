const express = require("express");

const router = express.Router();

const expensesController = require("./expenses.controller");


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