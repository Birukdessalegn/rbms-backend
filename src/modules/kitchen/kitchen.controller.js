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


// ============================================================
// GET KITCHEN AUDITS
// ============================================================

const getKitchenAudits = async (req, res) => {
  try {
    const { limit, productId, department } = req.query;
    const audits = await kitchenService.getKitchenAudits({
      limit: limit ? Number(limit) : 50,
      productId: productId ? Number(productId) : undefined,
      department: department || undefined,
    });

    res.json({
      success: true,
      count: audits.length,
      audits,
    });
  } catch (error) {
    console.error("Get kitchen audits error:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Failed to fetch kitchen audits",
    });
  }
};

// ============================================================
// VERIFY KITCHEN STOCK
// ============================================================

const verifyKitchenStock = async (req, res) => {
  try {
    const role = String(req.user?.role || "").toLowerCase();
    if (role === "chef" || role === "waiter" || role === "bartender") {
      return res.status(403).json({
        success: false,
        message: "Access denied: Kitchen staff cannot conduct F&B stock audits.",
      });
    }

    const {
      productId,
      department,
      action,
      physicalCountFound,
      notes,
    } = req.body;

    const audit = await kitchenService.verifyKitchenStock({
      productId,
      department: department || "kitchen",
      action,
      physicalCountFound,
      notes,
      userId: req.user?.id,
      verifierName: req.user?.username,
    });

    res.status(201).json({
      success: true,
      message: "Kitchen stock verification recorded successfully",
      audit,
    });
  } catch (error) {
    console.error("Verify kitchen stock error:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Failed to record kitchen stock verification",
    });
  }
};

module.exports = {
  getKitchenOrders,
  getKitchenOrder,
  createKitchenOrder,
  updateKitchenOrderStatus,
  deleteKitchenOrder,
  getKitchenAudits,
  verifyKitchenStock,
};