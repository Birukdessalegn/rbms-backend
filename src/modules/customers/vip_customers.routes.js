const express = require("express");
const router = express.Router();
const vipController = require("./vip_customers.controller");
const authenticate = require("../../middleware/auth.middleware");
const authorize = require("../../middleware/role.middleware");

// Require login for all VIP customer routes
router.use(authenticate);

router.get("/", vipController.getVipCustomers);
// Only Admin is allowed to register/create new VIP customers
router.post("/", authorize("admin"), vipController.createVipCustomer);
router.get("/:id", vipController.getVipCustomer);
// Only Admin is allowed to modify or delete VIP customers
router.put("/:id", authorize("admin"), vipController.updateVipCustomer);
router.delete("/:id", authorize("admin"), vipController.deleteVipCustomer);
router.post("/:id/repay", vipController.recordRepayment);
router.get("/:id/payments", vipController.getVipCustomerPayments);
router.get("/:id/repayments", vipController.getVipCustomerRepayments);
router.get("/:id/transactions", vipController.getVipCustomerTransactions);

module.exports = router;
