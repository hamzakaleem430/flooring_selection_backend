import express from "express";
import {
  createChat,
  deleteChat,
  fetchAllChats,
  fetchChats,
  createGroupChat,
  getChatByProjectId,
} from "../../controllers/chat/chatController.js";
import { isAuthenticated } from "../../middleware/authMiddleware.js";

const router = express.Router();

// Create Chat
router.post("/create", isAuthenticated, createChat);

// Create Group Chat
router.post("/group/create", isAuthenticated, createGroupChat);

// Get chat by project ID
router.get("/project/:projectId", getChatByProjectId);

// Fetch Chat
router.get("/fetch/:id", fetchChats);

// Fetch All Chats - For Admin
router.get("/fetchAll", fetchAllChats);

// Delete Chat
router.delete("/delete/:id", isAuthenticated, deleteChat);

export default router;
