import notificationModel from "../models/notificationModel.js";
import { getIO } from "../socketServer.js";

/**
 * Create a notification and emit real-time socket event
 * @param {Object} params - Notification parameters
 * @param {String} params.userId - User ID to receive notification
 * @param {String} params.subject - Notification subject/title
 * @param {String} params.context - Notification content/message
 * @param {String} params.type - Notification type (e.g., 'project', 'chat', 'review')
 * @param {String} params.redirectLink - Optional redirect link
 * @returns {Promise<Object>} Created notification
 */
export const createNotificationWithSocket = async ({
  userId,
  subject,
  context,
  type,
  redirectLink,
}) => {
  try {
    // Create notification in database
    const notification = await notificationModel.create({
      user: userId,
      subject,
      context,
      type,
      redirectLink,
      status: "unread",
    });

    // Populate user data
    await notification.populate("user", "name email profileImage");

    // Emit real-time notification via socket
    try {
      const io = getIO();
      // Emit to specific user's notification room
      io.to(`notification_${userId}`).emit("newNotification", {
        notification,
        message: subject,
      });
      console.log(`✅ Notification sent to user ${userId} via socket`);
    } catch (socketError) {
      console.warn("⚠️ Socket not available, notification saved to DB only:", socketError.message);
    }

    return notification;
  } catch (error) {
    console.error("Error creating notification:", error);
    throw error;
  }
};

/**
 * Create notifications for multiple users
 * @param {Object} params - Notification parameters
 * @param {Array<String>} params.userIds - Array of user IDs to receive notification
 * @param {String} params.subject - Notification subject/title
 * @param {String} params.context - Notification content/message
 * @param {String} params.type - Notification type
 * @param {String} params.redirectLink - Optional redirect link
 * @returns {Promise<Array>} Array of created notifications
 */
export const createBulkNotifications = async ({
  userIds,
  subject,
  context,
  type,
  redirectLink,
}) => {
  try {
    // Ensure userIds is an array
    if (!Array.isArray(userIds)) {
      console.error("userIds must be an array, received:", typeof userIds);
      throw new Error("userIds must be an array");
    }

    const notifications = [];

    for (const userId of userIds) {
      const notification = await createNotificationWithSocket({
        userId,
        subject,
        context,
        type,
        redirectLink,
      });
      notifications.push(notification);
    }

    return notifications;
  } catch (error) {
    console.error("Error creating bulk notifications:", error);
    throw error;
  }
};

/**
 * Send chat message notification
 * @param {Object} params - Chat notification parameters
 * @param {String} params.recipientId - Recipient user ID
 * @param {String} params.senderName - Sender's name
 * @param {String} params.message - Message preview
 * @param {String} params.chatRoomId - Chat room ID
 * @param {String} params.projectId - Project ID (optional)
 */
export const sendChatNotification = async ({
  recipientId,
  senderName,
  message,
  chatRoomId,
  projectId,
}) => {
  const messagePreview = message.length > 50 ? message.substring(0, 50) + "..." : message;
  
  // Use project chat route if projectId is available, otherwise use messages page
  const redirectLink = projectId ? `/projects/${projectId}/chat` : `/messages`;
  
  return await createNotificationWithSocket({
    userId: recipientId,
    subject: `New message from ${senderName}`,
    context: messagePreview,
    type: "chat",
    redirectLink: redirectLink,
  });
};

/**
 * Send project status change notification
 * @param {Object} params - Project notification parameters
 * @param {Array<String>} params.recipientIds - Array of recipient user IDs
 * @param {String} params.projectName - Project name
 * @param {String} params.projectId - Project ID
 * @param {String} params.status - New project status
 * @param {String} params.changedBy - Name of user who changed status
 */
export const sendProjectStatusNotification = async ({
  recipientIds,
  projectName,
  projectId,
  status,
  changedBy,
}) => {
  const statusMessages = {
    completed: `Project "${projectName}" has been marked as completed by ${changedBy}. Time to review!`,
    approved: `Project "${projectName}" has been approved!`,
    rejected: `Project "${projectName}" has been rejected.`,
    pending: `Project "${projectName}" status changed to pending.`,
    connected: `You have been connected to the project "${projectName}" by ${changedBy}.`,
  };

  return await createBulkNotifications({
    userIds: recipientIds,
    subject: `Project Status Update: ${projectName}`,
    context: statusMessages[status] || `Project "${projectName}" status changed to ${status}`,
    type: "project",
    redirectLink: `/projects/${projectId}`,
  });
};

