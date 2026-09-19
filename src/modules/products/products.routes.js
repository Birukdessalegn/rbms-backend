const express = require("express");

const router = express.Router();

const productsController = require("./products.controller");
const { uploadProductImage } = require("../../middleware/upload.middleware");
const authenticate = require("../../middleware/auth.middleware");
const authorize = require("../../middleware/role.middleware");

// Require authentication for all product endpoints
router.use(authenticate);

// Categories
router.get(
  "/categories",
  productsController.getCategories
);

router.post(
  "/categories",
  authorize("admin", "manager"),
  productsController.createCategory
);


// Menu
router.get(
  "/menu",
  productsController.getMenu
);

router.put(
  "/:id/menu",
  authorize("admin", "manager"),
  productsController.updateProductMenu
);


// Image Upload
router.post(
  "/upload",
  authorize("admin", "manager"),
  uploadProductImage.single("image"),
  productsController.uploadImage
);


// Products
router.get(
  "/",
  productsController.getProducts
);

router.get(
  "/:id",
  productsController.getProduct
);

router.post(
  "/",
  authorize("admin", "manager"),
  uploadProductImage.single("image"),
  productsController.createProduct
);

router.put(
  "/:id",
  authorize("admin", "manager"),
  uploadProductImage.single("image"),
  productsController.updateProduct
);

router.delete(
  "/:id",
  authorize("admin", "manager"),
  productsController.deleteProduct
);


module.exports = router;
