import sendMail from "../helper/mail.js";
import notificationModel from "../models/notificationModel.js";
import userModel from "../models/userModel.js";

// Create Notification
export const createNotification = async (req, res) => {
  try {
    const { subject, context, emails } = req.body;

    if (!emails || emails.length === 0) {
      return res.status(400).send({
        success: false,
        message: "No email address provided.",
      });
    }

    const users = await userModel.find({ email: { $in: emails } });

    if (users.length === 0) {
      return res.status(404).send({
        success: false,
        message: "No users found for the provided email addresses.",
      });
    }

    const notifications = [];

    // Create notifications and send emails for each user
    for (const user of users) {
      const notification = await notificationModel.create({
        user: user._id,
        subject,
        context,
      });

      notifications.push(notification);

      const data = {
        user: { name: user.name },
        subject,
        context,
      };

      await sendMail({
        email: user.email,
        subject: subject,
        template: "notification.ejs",
        data,
      });
    }

    res.status(200).send({
      success: true,
      message: "Notifications sent successfully!",
      notifications,
    });
  } catch (error) {
    console.error("Error sending notifications:", error);
    res.status(500).send({
      success: false,
      message: "Error occurred while sending notifications. Please try again!",
      error: error.message,
    });
  }
};

// Get All Notifications-Admin
export const getAllNotifications = async (req, res) => {
  try {
    const notifications = await notificationModel
      .find({
        status: "unread",
      })
      .populate("user", "name email");

    res.status(200).send({
      success: true,
      message: "Notifications fetched successfully!",
      notifications,
    });
  } catch (error) {
    console.error("Error fetching notifications:", error);
    res.status(500).send({
      success: false,
      message: "Error occurred while fetching notifications. Please try again!",
      error: error.message,
    });
  }
};

// Get All Notifications-Admin-Header
export const getAllHeaderNotifications = async (req, res) => {
  try {
    const notifications = await notificationModel
      .find({
        status: "unread",
        type: "admin",
      })
      .populate("user", "name email");

    res.status(200).send({
      success: true,
      message: "All notifications list!",
      notifications: notifications,
    });
  } catch (error) {
    console.error("Error fetching notifications:", error);
    res.status(500).send({
      success: false,
      message: "Error occurred while fetching notifications. Please try again!",
      error: error.message,
    });
  }
};

// Get user Notifications-User
export const getUserNotifications = async (req, res) => {
  try {
    const userId = req.params.id;

    const notifications = await notificationModel
      .find({
        user: userId,
        status: "unread",
        type: { $ne: "admin" },
      })
      .populate("user", "name email");

    res.status(200).send({
      success: true,
      message: "All user notifications!",
      notifications,
    });
  } catch (error) {
    console.error("Error fetching notifications:", error);
    res.status(500).send({
      success: false,
      message: "Error occurred while fetching notifications. Please try again!",
      error: error.message,
    });
  }
};

// Get Nitification Detail
export const getNotificationDetail = async (req, res) => {
  try {
    const notificationId = req.params.id;

    const notification = await notificationModel
      .findById(notificationId)
      .populate("user", "name email");

    if (!notification) {
      return res.status(404).send({
        success: false,
        message: "Notification not found.",
      });
    }

    res.status(200).send({
      success: true,
      message: "Notification Detail!",
      notification,
    });
  } catch (error) {
    console.error("Error fetching notification:", error);
    res.status(500).send({
      success: false,
      message: "Error occurred while fetching notification. Please try again!",
      error: error.message,
    });
  }
};

// Delete Notification
export const deleteNotification = async (req, res) => {
  try {
    const notificationId = req.params.id;

    const notification = await notificationModel.findByIdAndDelete(
      notificationId
    );

    if (!notification) {
      return res.status(404).send({
        success: false,
        message: "Notification not found.",
      });
    }

    res.status(200).send({
      success: true,
      message: "Notification deleted successfully!",
      notification,
    });
  } catch (error) {
    console.error("Error deleting notification:", error);
    res.status(500).send({
      success: false,
      message: "Error occurred while deleting notification. Please try again!",
      error: error.message,
    });
  }
};

// Mark Notification as Read
export const markNotificationAsRead = async (req, res) => {
  try {
    const notificationId = req.params.id;

    const notification = await notificationModel.findByIdAndUpdate(
      { _id: notificationId },
      { status: "read" },
      { new: true }
    );

    if (!notification) {
      return res.status(404).send({
        success: false,
        message: "Notification not found.",
      });
    }

    res.status(200).send({
      success: true,
      message: "Notification marked as read successfully!",
      notification,
    });
  } catch (error) {
    console.error("Error marking notification as read:", error);
    res.status(500).send({
      success: false,
      message:
        "Error occurred while marking notification as read. Please try again!",
      error: error.message,
    });
  }
};

// Mark All Notifications as Read
export const markAllNotificationsAsRead = async (req, res) => {
  try {
    const { nitificationIds } = req.body;

    const notifications = await notificationModel.updateMany(
      { _id: { $in: nitificationIds } },
      { status: "read" }
    );

    res.status(200).send({
      success: true,
      message: "All notifications marked as read successfully!",
      notifications,
    });
  } catch (error) {
    console.error("Error marking notifications as read:", error.message);
    res.status(500).send({
      success: false,
      message:
        "Error occurred while marking notifications as read. Please try again!",
      error: error.message,
    });
  }
};

// Delete All Notifications
export const deleteAllNotificationsData = async (req, res) => {
  try {
    const { notificationIds } = req.body;

    if (!Array.isArray(notificationIds) || notificationIds.length === 0) {
      return res.status(400).send({
        success: false,
        message: "No valid notification IDs provided.",
      });
    }

    await notificationModel.deleteMany({
      _id: { $in: notificationIds },
    });

    res.status(200).send({
      success: true,
      message: "All notifications deleted successfully!",
    });
  } catch (error) {
    console.error("Error deleting notifications:", error);
    res.status(500).send({
      success: false,
      message: "Error occurred while deleting notifications. Please try again!",
      error: error.message,
    });
  }
};
