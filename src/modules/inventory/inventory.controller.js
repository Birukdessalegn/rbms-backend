const inventoryService = require("./inventory.service");


// GET /api/inventory
const getInventory = async (req, res) => {
  try {
    const inventory = await inventoryService.getAllInventory();

    res.json({
      success: true,
      count: inventory.length,
      inventory,
    });

  } catch (error) {
    console.error("Get inventory error:", error);

    res.status(500).json({
      success: false,
      message: "Failed to fetch inventory",
    });
  }
};


// GET /api/inventory/low-stock
const getLowStock = async (req, res) => {
  try {
    const { location } = req.query;
    const inventory = await inventoryService.getLowStock(location);

    res.json({
      success: true,
      count: inventory.length,
      inventory,
    });

  } catch (error) {
    console.error("Get low stock error:", error);

    res.status(500).json({
      success: false,
      message: "Failed to fetch low stock products",
    });
  }
};


// GET /api/inventory/product/:productId
const getInventoryByProduct = async (req, res) => {
  try {
    const inventory =
      await inventoryService.getInventoryByProduct(
        req.params.productId
      );

    if (!inventory) {
      return res.status(404).json({
        success: false,
        message: "Inventory record not found",
      });
    }

    res.json({
      success: true,
      inventory,
    });

  } catch (error) {
    console.error("Get inventory error:", error);

    res.status(500).json({
      success: false,
      message: "Failed to fetch inventory",
    });
  }
};


// POST /api/inventory
const createInventory = async (req, res) => {
  try {
    const {
      productId,
    } = req.body;

    if (!productId) {
      return res.status(400).json({
        success: false,
        message: "Product ID is required",
      });
    }

    const inventory =
      await inventoryService.createInventory(req.body);

    res.status(201).json({
      success: true,
      message: "Inventory created successfully",
      inventory,
    });

  } catch (error) {
    console.error("Create inventory error:", error);

    res.status(500).json({
      success: false,
      message: "Failed to create inventory",
    });
  }
};


// PUT /api/inventory/product/:productId
const updateInventory = async (req, res) => {
  try {
    const inventory =
      await inventoryService.updateInventory(
        req.params.productId,
        req.body
      );

    if (!inventory) {
      return res.status(404).json({
        success: false,
        message: "Inventory record not found",
      });
    }

    res.json({
      success: true,
      message: "Inventory updated successfully",
      inventory,
    });

  } catch (error) {
    console.error("Update inventory error:", error);

    res.status(500).json({
      success: false,
      message: "Failed to update inventory",
    });
  }
};


// POST /api/inventory/stock-in
const stockIn = async (req, res) => {
  try {
    const {
      productId,
      quantity,
      notes,
      userId,
    } = req.body;

    if (!productId || !quantity || quantity <= 0) {
      return res.status(400).json({
        success: false,
        message: "Product ID and valid quantity are required",
      });
    }

    const inventory =
      await inventoryService.stockIn(
        productId,
        quantity,
        notes,
        userId
      );

    res.json({
      success: true,
      message: "Stock added successfully",
      inventory,
    });

  } catch (error) {
    console.error("Stock in error:", error);

    res.status(400).json({
      success: false,
      message: error.message || "Failed to add stock",
    });
  }
};


// POST /api/inventory/stock-out
const stockOut = async (req, res) => {
  try {
    const {
      productId,
      quantity,
      notes,
      userId,
    } = req.body;

    if (!productId || !quantity || quantity <= 0) {
      return res.status(400).json({
        success: false,
        message: "Product ID and valid quantity are required",
      });
    }

    const inventory =
      await inventoryService.stockOut(
        productId,
        quantity,
        notes,
        userId
      );

    res.json({
      success: true,
      message: "Stock removed successfully",
      inventory,
    });

  } catch (error) {
    console.error("Stock out error:", error);

    res.status(400).json({
      success: false,
      message: error.message || "Failed to remove stock",
    });
  }
};


// GET /api/inventory/product/:productId/transactions
const getTransactions = async (req, res) => {
  try {
    const transactions =
      await inventoryService.getTransactions(
        req.params.productId
      );

    res.json({
      success: true,
      count: transactions.length,
      transactions,
    });

  } catch (error) {
    console.error("Get transactions error:", error);

    res.status(500).json({
      success: false,
      message: "Failed to fetch inventory transactions",
    });
  }
};


// GET /api/inventory/multi-location
const getMultiLocationInventory = async (req, res) => {
  try {
    const inventory = await inventoryService.getMultiLocationInventory();

    res.json({
      success: true,
      count: inventory.length,
      inventory,
    });
  } catch (error) {
    console.error("Get multi-location inventory error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch multi-location inventory matrix",
    });
  }
};


// GET /api/inventory/departments/:department
const getDepartmentInventory = async (req, res) => {
  try {
    const { department } = req.params;
    const inventory = await inventoryService.getDepartmentInventory(department);

    res.json({
      success: true,
      department,
      count: inventory.length,
      inventory,
    });
  } catch (error) {
    console.error("Get department inventory error:", error);
    res.status(500).json({
      success: false,
      message: `Failed to fetch ${req.params.department} inventory`,
    });
  }
};


// PUT /api/inventory/departments/:department/product/:productId
const updateDepartmentStockSettings = async (req, res) => {
  try {
    const { department, productId } = req.params;
    const updated = await inventoryService.updateDepartmentStockSettings(
      department,
      productId,
      req.body
    );

    res.json({
      success: true,
      message: `${department.toUpperCase()} inventory settings updated successfully`,
      inventory: updated,
    });
  } catch (error) {
    console.error("Update department stock settings error:", error);
    res.status(400).json({
      success: false,
      message: error.message || "Failed to update department inventory settings",
    });
  }
};


module.exports = {
  getInventory,
  getInventoryByProduct,
  createInventory,
  updateInventory,
  stockIn,
  stockOut,
  getLowStock,
  getTransactions,
  getMultiLocationInventory,
  getDepartmentInventory,
  updateDepartmentStockSettings,
};