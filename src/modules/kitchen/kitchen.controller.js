const kitchenService = require("./kitchen.service");


// ============================================================
// GET ALL
// ============================================================

const getKitchenOrders = async (req, res) => {
  try {
    const orders = await kitchenService.getAllKitchenOrders();

    res.json({
      success: true,
      count: orders.length,
      orders,
    });

  } catch (error) {
    console.error("Get kitchen orders error:", error);

    res.status(500).json({
      success: false,
      message: "Failed to fetch kitchen orders",
    });
  }
};


// ============================================================
// GET ONE
// ============================================================

const getKitchenOrder = async (req, res) => {
  try {
    const order = await kitchenService.getKitchenOrderById(
      req.params.id
    );

    if (!order) {
      return res.status(404).json({
        success: false,
        message: "Kitchen order not found",
      });
    }

    res.json({
      success: true,
      order,
    });

  } catch (error) {
    console.error("Get kitchen order error:", error);

    res.status(500).json({
      success: false,
      message: "Failed to fetch kitchen order",
    });
  }
};


// ============================================================
// CREATE
// ============================================================

const createKitchenOrder = async (req, res) => {
  try {
    const {
      orderId,
      items,
    } = req.body;

    if (!orderId) {
      return res.status(400).json({
        success: false,
        message: "Order ID is required",
      });
    }

    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({
        success: false,
        message: "Kitchen order items are required",
      });
    }

    const order = await kitchenService.createKitchenOrder(
      req.body
    );

    res.status(201).json({
      success: true,
      message: "Kitchen order created successfully",
      order,
    });

  } catch (error) {
    console.error("Create kitchen order error:", error);

    res.status(500).json({
      success: false,
      message: "Failed to create kitchen order",
    });
  }
};


// ============================================================
// UPDATE STATUS
// ============================================================

const updateKitchenOrderStatus = async (req, res) => {
  try {
    const {
      status,
      chefId,
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
        message: "Invalid kitchen order status",
      });
    }

    const order = await kitchenService.updateKitchenOrderStatus(
      req.params.id,
      status,
      chefId
    );

    if (!order) {
      return res.status(404).json({
        success: false,
        message: "Kitchen order not found",
      });
    }

    res.json({
      success: true,
      message: "Kitchen order status updated successfully",
      order,
    });

  } catch (error) {
    console.error("Update kitchen status error:", error);

    res.status(500).json({
      success: false,
      message: "Failed to update kitchen order status",
    });
  }
};


// ============================================================
// DELETE
// ============================================================

const deleteKitchenOrder = async (req, res) => {
  try {
    const order = await kitchenService.deleteKitchenOrder(
      req.params.id
    );

    if (!order) {
      return res.status(404).json({
        success: false,
        message: "Kitchen order not found",
      });
    }

    res.json({
      success: true,
      message: "Kitchen order deleted successfully",
    });

  } catch (error) {
    console.error("Delete kitchen order error:", error);

    res.status(500).json({
      success: false,
      message: "Failed to delete kitchen order",
    });
  }
};


module.exports = {
  getKitchenOrders,
  getKitchenOrder,
  createKitchenOrder,
  updateKitchenOrderStatus,
  deleteKitchenOrder,
};