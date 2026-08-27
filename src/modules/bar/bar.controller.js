const barService = require("./bar.service");


// ============================================================
// GET ALL BAR ORDERS
// ============================================================

const getBarOrders = async (req, res) => {
  try {
    const orders = await barService.getAllBarOrders();

    res.json({
      success: true,
      count: orders.length,
      orders,
    });

  } catch (error) {
    console.error("Get bar orders error:", error);

    res.status(500).json({
      success: false,
      message: "Failed to fetch bar orders",
    });
  }
};


// ============================================================
// GET SINGLE BAR ORDER
// ============================================================

const getBarOrder = async (req, res) => {
  try {
    const order = await barService.getBarOrderById(
      req.params.id
    );

    if (!order) {
      return res.status(404).json({
        success: false,
        message: "Bar order not found",
      });
    }

    res.json({
      success: true,
      order,
    });

  } catch (error) {
    console.error("Get bar order error:", error);

    res.status(500).json({
      success: false,
      message: "Failed to fetch bar order",
    });
  }
};


// ============================================================
// UPDATE BAR ORDER STATUS
// ============================================================

const updateBarOrderStatus = async (req, res) => {
  try {
    const {
      status,
      bartenderId,
    } = req.body;

    if (!status) {
      return res.status(400).json({
        success: false,
        message: "Status is required",
      });
    }

    const order = await barService.updateBarOrderStatus(
      req.params.id,
      status,
      bartenderId
    );

    if (!order) {
      return res.status(404).json({
        success: false,
        message: "Bar order not found",
      });
    }

    res.json({
      success: true,
      message: "Bar order status updated successfully",
      order,
    });

  } catch (error) {
    console.error("Update bar order error:", error);

    res.status(400).json({
      success: false,
      message: error.message || "Failed to update bar order",
    });
  }
};


// ============================================================
// GET BAR ORDERS BY STATUS
// ============================================================

const getBarOrdersByStatus = async (req, res) => {
  try {
    const {
      status,
    } = req.query;

    if (!status) {
      return res.status(400).json({
        success: false,
        message: "Status query parameter is required",
      });
    }

    const orders = await barService.getBarOrdersByStatus(
      status
    );

    res.json({
      success: true,
      count: orders.length,
      orders,
    });

  } catch (error) {
    console.error("Get bar orders by status error:", error);

    res.status(500).json({
      success: false,
      message: "Failed to fetch bar orders",
    });
  }
};


module.exports = {
  getBarOrders,
  getBarOrder,
  updateBarOrderStatus,
  getBarOrdersByStatus,
};