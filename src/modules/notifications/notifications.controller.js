const notificationsService = require("./notifications.service");

const getNotifications = async (req, res) => {
  try {
    const userId = req.user?.id || null;
    const unreadOnly = req.query.unread === "true";
    const limit = parseInt(req.query.limit, 10) || 50;

    const notifications = await notificationsService.getNotifications(userId, unreadOnly, limit);

    return res.status(200).json({
      success: true,
      data: notifications,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to fetch notifications",
    });
  }
};

const markAsRead = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user?.id || null;

    const notification = await notificationsService.markAsRead(id, userId);

    return res.status(200).json({
      success: true,
      data: notification,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to mark notification as read",
    });
  }
};

const markAllAsRead = async (req, res) => {
  try {
    const userId = req.user?.id || null;

    const notifications = await notificationsService.markAllAsRead(userId);

    return res.status(200).json({
      success: true,
      message: "All notifications marked as read",
      data: notifications,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to mark all notifications as read",
    });
  }
};

module.exports = {
  getNotifications,
  markAsRead,
  markAllAsRead,
};
