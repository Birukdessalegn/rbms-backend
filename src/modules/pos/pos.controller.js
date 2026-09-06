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
      vipCustomerId: targetVipId,
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
    const tableNumber = req.body.tableNumber || req.body.table_number;

    if (!tableNumber) {
      return res.status(400).json({
        success: false,
        message: "Table number is required",
      });
    }

    const table = await posService.createTable(req.body);

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
// UPDATE RESTAURANT TABLE STATUS
// ============================================================

const updateTableStatus = async (req, res) => {
  try {
    const { status, waiterId, waiter_id } = req.body;

    if (!status) {
      return res.status(400).json({
        success: false,
        message: "Status is required",
      });
    }

    const effectiveWaiterId = waiterId || waiter_id || (req.user ? req.user.id : null);
    const table = await posService.updateTableStatus(
      req.params.id,
      status,
      effectiveWaiterId
    );

    if (!table) {
      return res.status(404).json({
        success: false,
        message: "Table not found",
      });
    }

    res.json({
      success: true,
      message: "Table status updated successfully",
      table,
    });
  } catch (error) {
    console.error("Update restaurant table status error:", error);

    res.status(500).json({
      success: false,
      message: error.message || "Failed to update table status",
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
};

// ============================================================
// ADD ITEMS TO ORDER (FOOD / BAR)
// ============================================================

const addOrderItems = async (req, res) => {
  try {
    const { items } = req.body;
    const orderId = req.params.id;

    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({
        success: false,
        message: "Items array is required",
      });
    }

    const updatedOrder = await posService.addOrderItems(orderId, items, req.user);

    return res.status(200).json({
      success: true,
      message: "Items added to order successfully",
      order: updatedOrder,
    });
  } catch (error) {
    console.error("Add order items error:", error);
    const statusCode = error.message && error.message.includes("not found") ? 404 : 400;
    return res.status(statusCode).json({
      success: false,
      message: error.message || "Failed to add items to order",
    });
  }
};

// ============================================================
// REMOVE / VOID ORDER ITEM
// ============================================================

const removeOrderItem = async (req, res) => {
  try {
    const { id: orderId, itemId } = req.params;
    const { reason } = req.body;

    const updatedOrder = await posService.removeOrderItem(orderId, itemId, { reason }, req.user);

    return res.status(200).json({
      success: true,
      message: "Order item voided successfully and inventory restored",
      order: updatedOrder,
    });
  } catch (error) {
    console.error("Remove order item error:", error);
    const statusCode = error.message && error.message.includes("not found") ? 404 : 400;
    return res.status(statusCode).json({
      success: false,
      message: error.message || "Failed to remove order item",
    });
  }
};

// ============================================================
// UPDATE ORDER ITEM (QUANTITY / NOTES)
// ============================================================

const updateOrderItem = async (req, res) => {
  try {
    const { id: orderId, itemId } = req.params;
    const { quantity, notes } = req.body;

    const updatedOrder = await posService.updateOrderItem(orderId, itemId, { quantity, notes }, req.user);

    return res.status(200).json({
      success: true,
      message: "Order item updated successfully",
      order: updatedOrder,
    });
  } catch (error) {
    console.error("Update order item error:", error);
    const statusCode = error.message && error.message.includes("not found") ? 404 : 400;
    return res.status(statusCode).json({
      success: false,
      message: error.message || "Failed to update order item",
    });
  }
};

module.exports = {
  getOrders,
  getOrder,
  createOrder,
  updateOrderStatus,
  addOrderItems,
  removeOrderItem,
  updateOrderItem,
  createPayment,

  getTables,
  createTable,
  updateTable,
  updateTableStatus,
  deleteTable,
};