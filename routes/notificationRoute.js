import express from "express";
import {
  createNotification,
  deleteAllNotificationsData,
  deleteNotification,
  getAllHeaderNotifications,
  getAllNotifications,
  getNotificationDetail,
  getUserNotifications,
  markAllNotificationsAsRead,
  markNotificationAsRead,
} from "../controllers/notificationController.js";
import { isAdmin, isAuthenticated } from "../middleware/authMiddleware.js";

const router = express.Router();

// Create Notification
router.post("/send", isAuthenticated, createNotification);

// Fetch All Notification-Admin
router.get("/all/admin", getAllNotifications);

// Fetch All Notification-User
router.get("/all/user/:id", getUserNotifications);

// Notification Detail
router.get("/detail/:id", getNotificationDetail);

// Delete Notification
router.delete("/delete/:id", isAuthenticated, isAdmin, deleteNotification);

// Mark Notification as Read
router.put("/read/:id", isAuthenticated, markNotificationAsRead);

// Mark All Notification as Read
router.put("/mark/all/read", isAuthenticated, markAllNotificationsAsRead);

// Delete All Notification
router.put("/delete/many", isAuthenticated, deleteAllNotificationsData);

// All Header Notifications for Admin
router.get("/header/admin/:id", getAllHeaderNotifications);

export default router;
