import express from "express";
import {
  getChatMessages,
  sendMessage,
} from "../../controllers/chat/messagesController.js";
import { isAuthenticated } from "../../middleware/authMiddleware.js";

const router = express.Router();

// Send Message
router.post("/send", isAuthenticated, sendMessage);
// Fetch Message
router.get("/all/:id/:userId", getChatMessages);

export default router;
