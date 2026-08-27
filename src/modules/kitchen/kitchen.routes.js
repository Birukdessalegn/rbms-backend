    const express = require("express");

    const router = express.Router();

    const kitchenController = require("./kitchen.controller");


    router.get(
    "/",
    kitchenController.getKitchenOrders
    );


    router.get(
    "/:id",
    kitchenController.getKitchenOrder
    );


    router.post(
    "/",
    kitchenController.createKitchenOrder
    );


    router.put(
    "/:id/status",
    kitchenController.updateKitchenOrderStatus
    );


    router.delete(
    "/:id",
    kitchenController.deleteKitchenOrder
    );


    module.exports = router;