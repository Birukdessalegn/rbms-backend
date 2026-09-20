const express = require("express");

const {
  register,
  login,
  changePassword,
  getProfile,
} = require("./auth.controller");

const authenticate = require("../../middleware/auth.middleware");
const authorize = require("../../middleware/role.middleware");
const rateLimit = require("../../middleware/rate_limit.middleware");

const router = express.Router();

// 30-Second Brute Force Protection (Max 10 attempts per 30s per IP)
const loginLimiter = rateLimit({
  windowMs: 30 * 1000,
  max: 10,
  message: "Too many login attempts. Please wait 30 seconds before trying again.",
});

router.post("/register", authenticate, authorize("admin"), register);
router.post("/login", loginLimiter, login);
router.put("/change-password", authenticate, changePassword);

// Get currently logged-in user profile (including employee name)
router.get("/me", authenticate, getProfile);
router.get("/profile", authenticate, getProfile);

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