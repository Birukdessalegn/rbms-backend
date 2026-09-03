const express = require("express");
const router = express.Router();
const vipController = require("./vip_customers.controller");

router.get("/", vipController.getVipCustomers);
router.post("/", vipController.createVipCustomer);
router.get("/:id", vipController.getVipCustomer);
router.put("/:id", vipController.updateVipCustomer);
router.delete("/:id", vipController.deleteVipCustomer);
router.post("/:id/repay", vipController.recordRepayment);
router.get("/:id/payments", vipController.getVipCustomerPayments);
router.get("/:id/repayments", vipController.getVipCustomerRepayments);
router.get("/:id/transactions", vipController.getVipCustomerTransactions);

module.exports = router;
