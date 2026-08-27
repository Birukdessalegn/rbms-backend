const productsService = require("./products.service");


// GET /api/products
const getProducts = async (req, res) => {
  try {
    const products = await productsService.getAllProducts();

    res.json({
      success: true,
      count: products.length,
      products,
    });
  } catch (error) {
    console.error("Get products error:", error);

    res.status(500).json({
      success: false,
      message: "Failed to fetch products",
    });
  }
};


// GET /api/products/:id
const getProduct = async (req, res) => {
  try {
    const product = await productsService.getProductById(
      req.params.id
    );

    if (!product) {
      return res.status(404).json({
        success: false,
        message: "Product not found",
      });
    }

    res.json({
      success: true,
      product,
    });
  } catch (error) {
    console.error("Get product error:", error);

    res.status(500).json({
      success: false,
      message: "Failed to fetch product",
    });
  }
};


// POST /api/products
const createProduct = async (req, res) => {
  try {
    const {
      name,
      price,
    } = req.body;

    if (!name || price === undefined) {
      return res.status(400).json({
        success: false,
        message: "Product name and price are required",
      });
    }

    const product =
      await productsService.createProduct(req.body);

    res.status(201).json({
      success: true,
      message: "Product created successfully",
      product,
    });
  } catch (error) {
    console.error("Create product error:", error);

    res.status(500).json({
      success: false,
      message: "Failed to create product",
    });
  }
};


// PUT /api/products/:id
const updateProduct = async (req, res) => {
  try {
    const product =
      await productsService.updateProduct(
        req.params.id,
        req.body
      );

    if (!product) {
      return res.status(404).json({
        success: false,
        message: "Product not found",
      });
    }

    res.json({
      success: true,
      message: "Product updated successfully",
      product,
    });
  } catch (error) {
    console.error("Update product error:", error);

    res.status(500).json({
      success: false,
      message: "Failed to update product",
    });
  }
};


// DELETE /api/products/:id
const deleteProduct = async (req, res) => {
  try {
    const product =
      await productsService.deleteProduct(
        req.params.id
      );

    if (!product) {
      return res.status(404).json({
        success: false,
        message: "Product not found",
      });
    }

    res.json({
      success: true,
      message: "Product deactivated successfully",
      product,
    });
  } catch (error) {
    console.error("Delete product error:", error);

    res.status(500).json({
      success: false,
      message: "Failed to deactivate product",
    });
  }
};


// GET /api/products/categories
const getCategories = async (req, res) => {
  try {
    const categories =
      await productsService.getCategories();

    res.json({
      success: true,
      count: categories.length,
      categories,
    });
  } catch (error) {
    console.error("Get categories error:", error);

    res.status(500).json({
      success: false,
      message: "Failed to fetch categories",
    });
  }
};


// POST /api/products/categories
const createCategory = async (req, res) => {
  try {
    const { name } = req.body;

    if (!name) {
      return res.status(400).json({
        success: false,
        message: "Category name is required",
      });
    }

    const category =
      await productsService.createCategory(req.body);

    res.status(201).json({
      success: true,
      message: "Category created successfully",
      category,
    });
  } catch (error) {
    console.error("Create category error:", error);

    res.status(500).json({
      success: false,
      message: "Failed to create category",
    });
  }
};


module.exports = {
  getProducts,
  getProduct,
  createProduct,
  updateProduct,
  deleteProduct,
  getCategories,
  createCategory,
};  