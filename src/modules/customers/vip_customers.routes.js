const express = require("express");
const router = express.Router();
const vipController = require("./vip_customers.controller");

router.get("/", vipController.getVipCustomers);
router.post("/", vipController.createVipCustomer);
router.put("/:id", vipController.updateVipCustomer);
router.post("/:id/repay", vipController.recordRepayment);
router.delete("/:id", vipController.deleteVipCustomer);

module.exports = router;
