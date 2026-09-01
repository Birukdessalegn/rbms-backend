const express = require("express");

const router = express.Router();

const productsController = require("./products.controller");
const { uploadProductImage } = require("../../middleware/upload.middleware");


// Categories
router.get(
  "/categories",
  productsController.getCategories
);

router.post(
  "/categories",
  productsController.createCategory
);


// Menu
router.get(
  "/menu",
  productsController.getMenu
);

router.put(
  "/:id/menu",
  productsController.updateProductMenu
);


// Image Upload
router.post(
  "/upload",
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
  uploadProductImage.single("image"),
  productsController.createProduct
);

router.put(
  "/:id",
  uploadProductImage.single("image"),
  productsController.updateProduct
);

router.delete(
  "/:id",
  productsController.deleteProduct
);


module.exports = router;
