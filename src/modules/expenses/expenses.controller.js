const expensesService = require("./expenses.service");


// ============================================================
// GET ALL EXPENSES
// ============================================================

const getExpenses = async (req, res) => {
  try {
    const expenses = await expensesService.getAllExpenses();

    res.json({
      success: true,
      count: expenses.length,
      expenses,
    });

  } catch (error) {
    console.error("Get expenses error:", error);

    res.status(500).json({
      success: false,
      message: "Failed to fetch expenses",
    });
  }
};


// ============================================================
// GET SINGLE EXPENSE
// ============================================================

const getExpense = async (req, res) => {
  try {
    const expense = await expensesService.getExpenseById(
      req.params.id
    );

    if (!expense) {
      return res.status(404).json({
        success: false,
        message: "Expense not found",
      });
    }

    res.json({
      success: true,
      expense,
    });

  } catch (error) {
    console.error("Get expense error:", error);

    res.status(500).json({
      success: false,
      message: "Failed to fetch expense",
    });
  }
};


// ============================================================
// CREATE EXPENSE
// ============================================================

const createExpense = async (req, res) => {
  try {
    const {
      description,
      amount,
    } = req.body;

    if (!description || amount === undefined) {
      return res.status(400).json({
        success: false,
        message: "Description and amount are required",
      });
    }

    if (Number(amount) <= 0) {
      return res.status(400).json({
        success: false,
        message: "Amount must be greater than zero",
      });
    }

    const expense = await expensesService.createExpense(
      req.body
    );

    res.status(201).json({
      success: true,
      message: "Expense created successfully",
      expense,
    });

  } catch (error) {
    console.error("Create expense error:", error);

    res.status(500).json({
      success: false,
      message: "Failed to create expense",
    });
  }
};


// ============================================================
// UPDATE EXPENSE
// ============================================================

const updateExpense = async (req, res) => {
  try {
    const expense = await expensesService.updateExpense(
      req.params.id,
      req.body
    );

    if (!expense) {
      return res.status(404).json({
        success: false,
        message: "Expense not found",
      });
    }

    res.json({
      success: true,
      message: "Expense updated successfully",
      expense,
    });

  } catch (error) {
    console.error("Update expense error:", error);

    res.status(500).json({
      success: false,
      message: "Failed to update expense",
    });
  }
};


// ============================================================
// DELETE EXPENSE
// ============================================================

const deleteExpense = async (req, res) => {
  try {
    const expense = await expensesService.deleteExpense(
      req.params.id
    );

    if (!expense) {
      return res.status(404).json({
        success: false,
        message: "Expense not found",
      });
    }

    res.json({
      success: true,
      message: "Expense deleted successfully",
    });

  } catch (error) {
    console.error("Delete expense error:", error);

    res.status(500).json({
      success: false,
      message: "Failed to delete expense",
    });
  }
};


// ============================================================
// GET CATEGORIES
// ============================================================

const getExpenseCategories = async (req, res) => {
  try {
    const categories =
      await expensesService.getExpenseCategories();

    res.json({
      success: true,
      count: categories.length,
      categories,
    });

  } catch (error) {
    console.error("Get expense categories error:", error);

    res.status(500).json({
      success: false,
      message: "Failed to fetch expense categories",
    });
  }
};


// ============================================================
// GET SUMMARY
// ============================================================

const getExpenseSummary = async (req, res) => {
  try {
    const summary =
      await expensesService.getExpenseSummary();

    res.json({
      success: true,
      summary,
    });

  } catch (error) {
    console.error("Get expense summary error:", error);

    res.status(500).json({
      success: false,
      message: "Failed to fetch expense summary",
    });
  }
};


module.exports = {
  getExpenses,
  getExpense,
  createExpense,
  updateExpense,
  deleteExpense,
  getExpenseCategories,
  getExpenseSummary,
};