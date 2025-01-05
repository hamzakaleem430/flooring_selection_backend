import express from "express";
import { isAuthenticated } from "../../middlewares/authMiddleware.js";
import {
  getChatMessages,
  sendMessage,
} from "../../controllers/chat/messagesController.js";

const router = express.Router();

// Send Message
router.post("/send", isAuthenticated, sendMessage);
// Fetch Message
router.get("/all/:id", getChatMessages);

export default router;
