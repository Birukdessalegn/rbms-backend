const express = require("express");

const router = express.Router();

const productsController = require("./products.controller");


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
  productsController.createProduct
);

router.put(
  "/:id",
  productsController.updateProduct
);

router.delete(
  "/:id",
  productsController.deleteProduct
);


module.exports = router;
