const paymentsService = require("./payments.service");

// ============================================================
// GET ALL PAYMENTS
// ============================================================

const getPayments = async (req, res) => {
  try {
    const payments =
      await paymentsService.getAllPayments();

    res.json({
      success: true,
      count: payments.length,
      payments,
    });

  } catch (error) {
    console.error("Get payments error:", error);

    res.status(500).json({
      success: false,
      message: "Failed to fetch payments",
    });
  }
};


// ============================================================
// GET PAYMENT
// ============================================================

const getPayment = async (req, res) => {
  try {
    const payment =
      await paymentsService.getPaymentById(
        req.params.id
      );

    if (!payment) {
      return res.status(404).json({
        success: false,
        message: "Payment not found",
      });
    }

    res.json({
      success: true,
      payment,
    });

  } catch (error) {
    console.error("Get payment error:", error);

    res.status(500).json({
      success: false,
      message: "Failed to fetch payment",
    });
  }
};


// ============================================================
// GET PAYMENTS BY ORDER
// ============================================================

const getPaymentsByOrder = async (req, res) => {
  try {
    const payments =
      await paymentsService.getPaymentsByOrderId(
        req.params.orderId
      );

    res.json({
      success: true,
      count: payments.length,
      payments,
    });

  } catch (error) {
    console.error(
      "Get order payments error:",
      error
    );

    res.status(500).json({
      success: false,
      message: "Failed to fetch order payments",
    });
  }
};


// ============================================================
// CREATE PAYMENT
// ============================================================

const createPayment = async (req, res) => {
  try {

    const {
      orderId,
      amount,
      paymentMethod,
    } = req.body;

    if (!orderId) {
      return res.status(400).json({
        success: false,
        message: "Order ID is required",
      });
    }

    if (amount === undefined || Number(amount) <= 0) {
      return res.status(400).json({
        success: false,
        message: "Valid payment amount is required",
      });
    }

    if (!paymentMethod) {
      return res.status(400).json({
        success: false,
        message: "Payment method is required",
      });
    }

    const payment =
      await paymentsService.createPayment({
        ...req.body,
        receivedBy: req.user?.id || req.body.receivedBy,
      });

    res.status(201).json({
      success: true,
      message: "Payment recorded successfully",
      payment,
    });

  } catch (error) {

    console.error(
      "Create payment error:",
      error
    );

    res.status(400).json({
      success: false,
      message:
        error.message ||
        "Failed to create payment",
    });
  }
};


// ============================================================
// REFUND PAYMENT
// ============================================================

const refundPayment = async (req, res) => {
  try {

    const payment =
      await paymentsService.refundPayment(
        req.params.id
      );

    res.json({
      success: true,
      message: "Payment refunded successfully",
      payment,
    });

  } catch (error) {

    console.error(
      "Refund payment error:",
      error
    );

    res.status(400).json({
      success: false,
      message:
        error.message ||
        "Failed to refund payment",
    });
  }
};


module.exports = {
  getPayments,
  getPayment,
  getPaymentsByOrder,
  createPayment,
  refundPayment,
};