const purchasingService = require("./purchasing.service");


// ============================================================
// SUPPLIERS
// ============================================================

const getSuppliers = async (req, res) => {
  try {
    const suppliers =
      await purchasingService.getAllSuppliers();

    res.json({
      success: true,
      count: suppliers.length,
      suppliers,
    });

  } catch (error) {
    console.error("Get suppliers error:", error);

    res.status(500).json({
      success: false,
      message: "Failed to fetch suppliers",
    });
  }
};


const getSupplier = async (req, res) => {
  try {
    const supplier =
      await purchasingService.getSupplierById(
        req.params.id
      );

    if (!supplier) {
      return res.status(404).json({
        success: false,
        message: "Supplier not found",
      });
    }

    res.json({
      success: true,
      supplier,
    });

  } catch (error) {
    console.error("Get supplier error:", error);

    res.status(500).json({
      success: false,
      message: "Failed to fetch supplier",
    });
  }
};


const createSupplier = async (req, res) => {
  try {
    const { name } = req.body;

    if (!name) {
      return res.status(400).json({
        success: false,
        message: "Supplier name is required",
      });
    }

    const supplier =
      await purchasingService.createSupplier(
        req.body
      );

    res.status(201).json({
      success: true,
      message: "Supplier created successfully",
      supplier,
    });

  } catch (error) {
    console.error("Create supplier error:", error);

    res.status(500).json({
      success: false,
      message: "Failed to create supplier",
    });
  }
};


// ============================================================
// PURCHASE ORDERS
// ============================================================

const getPurchases = async (req, res) => {
  try {
    const purchases =
      await purchasingService.getAllPurchases();

    res.json({
      success: true,
      count: purchases.length,
      purchases,
    });

  } catch (error) {
    console.error("Get purchases error:", error);

    res.status(500).json({
      success: false,
      message: "Failed to fetch purchases",
    });
  }
};


const getPurchase = async (req, res) => {
  try {
    const purchase =
      await purchasingService.getPurchaseById(
        req.params.id
      );

    if (!purchase) {
      return res.status(404).json({
        success: false,
        message: "Purchase order not found",
      });
    }

    res.json({
      success: true,
      purchase,
    });

  } catch (error) {
    console.error("Get purchase error:", error);

    res.status(500).json({
      success: false,
      message: "Failed to fetch purchase order",
    });
  }
};


const createPurchase = async (req, res) => {
  try {
    const {
      purchaseNumber,
      items,
    } = req.body;

    if (!purchaseNumber) {
      return res.status(400).json({
        success: false,
        message: "Purchase number is required",
      });
    }

    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({
        success: false,
        message: "At least one purchase item is required",
      });
    }

    const purchase =
      await purchasingService.createPurchase(
        req.body
      );

    res.status(201).json({
      success: true,
      message: "Purchase order created successfully",
      purchase,
    });

  } catch (error) {
    console.error("Create purchase error:", error);

    res.status(400).json({
      success: false,
      message: error.message || "Failed to create purchase order",
    });
  }
};


const updatePurchase = async (req, res) => {
  try {
    const purchase =
      await purchasingService.updatePurchase(
        req.params.id,
        req.body
      );

    if (!purchase) {
      return res.status(404).json({
        success: false,
        message: "Purchase order not found",
      });
    }

    res.json({
      success: true,
      message: "Purchase order updated successfully",
      purchase,
    });

  } catch (error) {
    console.error("Update purchase error:", error);

    res.status(400).json({
      success: false,
      message: error.message || "Failed to update purchase",
    });
  }
};


// ============================================================
// RECEIVE PURCHASE
// ============================================================

const receivePurchase = async (req, res) => {
  try {
    const {
      userId,
    } = req.body;

    const purchase =
      await purchasingService.receivePurchase(
        req.params.id,
        userId
      );

    res.json({
      success: true,
      message:
        "Purchase received and inventory updated successfully",
      purchase,
    });

  } catch (error) {
    console.error("Receive purchase error:", error);

    res.status(400).json({
      success: false,
      message:
        error.message || "Failed to receive purchase",
    });
  }
};


// ============================================================
// CANCEL PURCHASE
// ============================================================

const cancelPurchase = async (req, res) => {
  try {
    const purchase =
      await purchasingService.cancelPurchase(
        req.params.id
      );

    if (!purchase) {
      return res.status(400).json({
        success: false,
        message:
          "Purchase cannot be cancelled or does not exist",
      });
    }

    res.json({
      success: true,
      message: "Purchase cancelled successfully",
      purchase,
    });

  } catch (error) {
    console.error("Cancel purchase error:", error);

    res.status(500).json({
      success: false,
      message: "Failed to cancel purchase",
    });
  }
};


// ============================================================
// PAY PURCHASE (MARK AS PAID)
// ============================================================

const payPurchase = async (req, res) => {
  try {
    const {
      paymentMethod,
    } = req.body;

    const purchase =
      await purchasingService.payPurchase(
        req.params.id,
        paymentMethod || "cash"
      );

    if (!purchase) {
      return res.status(404).json({
        success: false,
        message: "Purchase order not found",
      });
    }

    res.json({
      success: true,
      message: "Purchase payment marked as PAID successfully",
      purchase,
    });

  } catch (error) {
    console.error("Pay purchase error:", error);

    res.status(400).json({
      success: false,
      message:
        error.message || "Failed to update purchase payment",
    });
  }
};


module.exports = {
  getSuppliers,
  getSupplier,
  createSupplier,

  getPurchases,
  getPurchase,
  createPurchase,
  updatePurchase,
  receivePurchase,
  cancelPurchase,

  payPurchase,
};
  