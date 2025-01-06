import express from "express";
import {
  createChat,
  deleteChat,
  fetchChats,
} from "../../controllers/chat/chatController.js";
import { isAuthenticated } from "../../middleware/authMiddleware.js";

const router = express.Router();

// Create Chat
router.post("/create", isAuthenticated, createChat);

// Fetch Chat
router.get("/fetch/:id", fetchChats);

// Delete Chat
router.delete("/delete/:id", isAuthenticated, deleteChat);

export default router;
