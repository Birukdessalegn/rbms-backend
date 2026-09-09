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


const recurringExpensesService = require("./recurringExpenses.service");


// ============================================================
// RECURRING EXPENSES CONTROLLERS
// ============================================================

const getRecurringExpenses = async (req, res) => {
  try {
    const list = await recurringExpensesService.getAllRecurringExpenses();
    res.json({
      success: true,
      count: list.length,
      recurringExpenses: list,
    });
  } catch (error) {
    console.error("Get recurring expenses error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch recurring expenses",
    });
  }
};

const getRecurringExpense = async (req, res) => {
  try {
    const item = await recurringExpensesService.getRecurringExpenseById(req.params.id);
    if (!item) {
      return res.status(404).json({
        success: false,
        message: "Recurring expense not found",
      });
    }
    res.json({
      success: true,
      recurringExpense: item,
    });
  } catch (error) {
    console.error("Get recurring expense error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch recurring expense",
    });
  }
};

const createRecurringExpense = async (req, res) => {
  try {
    const {
      title,
      categoryId,
      amount,
      frequency,
      dueDay,
      paymentMethod,
      notifyBeforeDays,
      notes,
    } = req.body;

    if (!title || !amount) {
      return res.status(400).json({
        success: false,
        message: "Title and amount are required",
      });
    }

    const createdBy = req.user?.id || null;
    const item = await recurringExpensesService.createRecurringExpense({
      title,
      categoryId,
      amount,
      frequency,
      dueDay,
      paymentMethod,
      notifyBeforeDays,
      notes,
      createdBy,
    });

    res.status(201).json({
      success: true,
      message: "Recurring expense schedule created",
      recurringExpense: item,
    });
  } catch (error) {
    console.error("Create recurring expense error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to create recurring expense",
    });
  }
};

const updateRecurringExpense = async (req, res) => {
  try {
    const updated = await recurringExpensesService.updateRecurringExpense(
      req.params.id,
      req.body
    );

    if (!updated) {
      return res.status(404).json({
        success: false,
        message: "Recurring expense not found",
      });
    }

    res.json({
      success: true,
      message: "Recurring expense schedule updated",
      recurringExpense: updated,
    });
  } catch (error) {
    console.error("Update recurring expense error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to update recurring expense",
    });
  }
};

const deleteRecurringExpense = async (req, res) => {
  try {
    const deleted = await recurringExpensesService.deleteRecurringExpense(req.params.id);
    if (!deleted) {
      return res.status(404).json({
        success: false,
        message: "Recurring expense not found",
      });
    }

    res.json({
      success: true,
      message: "Recurring expense schedule deleted",
    });
  } catch (error) {
    console.error("Delete recurring expense error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to delete recurring expense",
    });
  }
};

const payRecurringExpense = async (req, res) => {
  try {
    const userId = req.user?.id || null;
    const result = await recurringExpensesService.recordPayment(req.params.id, {
      ...req.body,
      userId,
    });

    res.status(201).json({
      success: true,
      message: "Recurring expense recorded and marked as paid",
      data: result,
    });
  } catch (error) {
    console.error("Pay recurring expense error:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Failed to record recurring payment",
    });
  }
};

const triggerRecurringNotifications = async (req, res) => {
  try {
    await recurringExpensesService.checkDueRecurringExpensesAndNotify();
    res.json({
      success: true,
      message: "Recurring expense due check completed",
    });
  } catch (error) {
    console.error("Trigger recurring notifications error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to run recurring expense check",
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
  getRecurringExpenses,
  getRecurringExpense,
  createRecurringExpense,
  updateRecurringExpense,
  deleteRecurringExpense,
  payRecurringExpense,
  triggerRecurringNotifications,
};