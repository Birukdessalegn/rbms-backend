const posService = require("./pos.service");
const vipCustomersService = require("../customers/vip_customers.service");


// ============================================================
// GET ALL ORDERS
// ============================================================

const getOrders = async (req, res) => {
  try {

    const orders = await posService.getAllOrders();

    res.json({
      success: true,
      count: orders.length,
      orders,
    });

  } catch (error) {

    console.error("Get POS orders error:", error);

    res.status(500).json({
      success: false,
      message: "Failed to fetch POS orders",
    });

  }
};


// ============================================================
// GET ONE ORDER
// ============================================================

const getOrder = async (req, res) => {
  try {

    const order = await posService.getOrderById(
      req.params.id
    );

    if (!order) {
      return res.status(404).json({
        success: false,
        message: "Order not found",
      });
    }

    res.json({
      success: true,
      order,
    });

  } catch (error) {

    console.error("Get POS order error:", error);

    res.status(500).json({
      success: false,
      message: "Failed to fetch order",
    });

  }
};


// ============================================================
// CREATE ORDER
// ============================================================

const createOrder = async (req, res) => {
  try {
    const order = await posService.createOrder({
      ...req.body,

      // JWT user ID & user object for RBAC checks
      waiterId: req.user?.id,
      user: req.user,
    });

    res.status(201).json({
      success: true,
      message: "Order created successfully",
      order,
    });
  } catch (error) {
    console.error("Create order error:", error);

    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// ============================================================
// UPDATE STATUS
// ============================================================

const updateOrderStatus = async (req, res) => {
  try {

    const {
      status,
    } = req.body;


    const allowedStatuses = [
      "pending",
      "confirmed",
      "preparing",
      "ready",
      "served",
      "completed",
      "cancelled",
    ];


    if (!status) {
      return res.status(400).json({
        success: false,
        message: "Status is required",
      });
    }


    if (!allowedStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        message: "Invalid order status",
      });
    }


    const order = await posService.updateOrderStatus(
      req.params.id,
      status
    );


    if (!order) {
      return res.status(404).json({
        success: false,
        message: "Order not found",
      });
    }


    res.json({
      success: true,
      message: "Order status updated successfully",
      order,
    });

  } catch (error) {

    console.error("Update order status error:", error);

    res.status(500).json({
      success: false,
      message: "Failed to update order status",
    });

  }
};


// ============================================================
// PAYMENT
// ============================================================

const createPayment = async (req, res) => {
  try {
    const { amount, paymentMethod, vipCustomerId, customerId } = req.body;

    if (!amount || !paymentMethod) {
      return res.status(400).json({
        success: false,
        message: "Amount and payment method are required",
      });
    }

    const targetVipId = vipCustomerId || customerId;
    // If paying with VIP credit, deduct from their VIP balance
    if ((paymentMethod === "credit" || paymentMethod === "vip") && targetVipId) {
      await vipCustomersService.addVipDebt(targetVipId, amount);
    }

    const orderId = req.params.id || req.params.orderId;

    const result = await posService.createPayment(orderId, {
      ...req.body,
      receivedBy: req.user?.id || req.body.receivedBy,
    });

    res.status(201).json({
      success: true,
      message: result.isFullyPaid
        ? "Order fully settled!"
        : "Partial payment recorded.",
      payment: result.payment,
      total_paid: result.totalPaid,
      remaining_balance: result.remainingBalance,
      is_fully_paid: result.isFullyPaid,
    });
  } catch (error) {
    console.error("Create payment error:", error);

    res.status(400).json({
      success: false,
      message: error.message || "Failed to record payment",
    });
  }
};

// ============================================================
// GET ALL RESTAURANT TABLES
// ============================================================

const getTables = async (req, res) => {
  try {
    const tables = await posService.getAllTables();

    res.json({
      success: true,
      count: tables.length,
      tables,
    });

  } catch (error) {
    console.error("Get restaurant tables error:", error);

    res.status(500).json({
      success: false,
      message: "Failed to fetch restaurant tables",
    });
  }
};


// ============================================================
// CREATE RESTAURANT TABLE
// ============================================================

const createTable = async (req, res) => {
  try {
    const {
      tableNumber,
      capacity,
      location,
    } = req.body;

    if (!tableNumber) {
      return res.status(400).json({
        success: false,
        message: "Table number is required",
      });
    }

    const table = await posService.createTable({
      tableNumber,
      capacity,
      location,
    });

    res.status(201).json({
      success: true,
      message: "Restaurant table created successfully",
      table,
    });

  } catch (error) {
    console.error("Create restaurant table error:", error);

    res.status(500).json({
      success: false,
      message: error.message || "Failed to create restaurant table",
    });
  }
};


// ============================================================
// UPDATE RESTAURANT TABLE
// ============================================================

const updateTable = async (req, res) => {
  try {
    const table = await posService.updateTable(
      req.params.id,
      req.body
    );

    if (!table) {
      return res.status(404).json({
        success: false,
        message: "Table not found",
      });
    }

    res.json({
      success: true,
      message: "Table updated successfully",
      table,
    });

  } catch (error) {
    console.error("Update restaurant table error:", error);

    res.status(500).json({
      success: false,
      message: error.message || "Failed to update table",
    });
  }
};


// ============================================================
// DELETE RESTAURANT TABLE
// ============================================================

const deleteTable = async (req, res) => {
  try {
    const table = await posService.deleteTable(
      req.params.id
    );

    if (!table) {
      return res.status(404).json({
        success: false,
        message: "Table not found",
      });
    }

    res.json({
      success: true,
      message: "Table deleted successfully",
      table,
    });

  } catch (error) {
    console.error("Delete restaurant table error:", error);

    res.status(500).json({
      success: false,
      message: error.message || "Failed to delete table",
    });
  }
};module.exports = {
  getOrders,
  getOrder,
  createOrder,
  updateOrderStatus,
  createPayment,

  getTables,
  createTable,
  updateTable,
  deleteTable,
};