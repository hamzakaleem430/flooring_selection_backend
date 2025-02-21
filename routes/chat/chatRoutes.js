import express from "express";
import {
  createChat,
  deleteChat,
  fetchAllChats,
  fetchChats,
} from "../../controllers/chat/chatController.js";
import { isAuthenticated } from "../../middleware/authMiddleware.js";

const router = express.Router();

// Create Chat
router.post("/create", isAuthenticated, createChat);

// Fetch Chat
router.get("/fetch/:id", fetchChats);

// Fetch All Chats - For Admin
router.get("/fetchAll", fetchAllChats);

// Delete Chat
router.delete("/delete/:id", isAuthenticated, deleteChat);

export default router;
