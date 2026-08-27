const express = require("express");

const {
  register,
  login,
} = require("./auth.controller");

const authenticate = require("../../middleware/auth.middleware");
const authorize = require("../../middleware/role.middleware");

const router = express.Router();

router.post("/register", register);
router.post("/login", login);

// Protected test route
router.get("/me", authenticate, (req, res) => {
  res.json({
    success: true,
    message: "Authenticated successfully",
    user: req.user,
  });
});

// Admin + Manager only
router.get(
  "/management-test",
  authenticate,
  authorize("admin", "manager"),
  (req, res) => {
    res.json({
      success: true,
      message: "You have management access",
      user: req.user,
    });
  }
);

module.exports = router;