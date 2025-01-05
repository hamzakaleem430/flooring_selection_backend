import express from "express";
import { isAuthenticated } from "../../middlewares/authMiddleware.js";
import {
  createChat,
  deleteChat,
  fetchChats,
} from "../../controllers/chat/chatController.js";

const router = express.Router();

// Create Chat
router.post("/create", isAuthenticated, createChat);

// Fetch Chat
router.get("/fetch/:id", fetchChats);

// Delete Chat
router.delete("/delete/:id", isAuthenticated, deleteChat);

export default router;
