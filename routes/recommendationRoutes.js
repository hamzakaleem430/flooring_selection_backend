import express from "express";
import { isAuthenticated } from "../middleware/authMiddleware.js";
import {
  createRecommendation,
  getUserRecommendations,
  getRecommendation,
  deleteRecommendation,
  updateRecommendation,
  clearConversationHistory,
  searchRecommendations,
} from "../controllers/recommendationController.js";

const router = express.Router();

// Create or continue recommendation conversation
router.post("/create", isAuthenticated, createRecommendation);

// Get all recommendations for user (with pagination)
router.get("/user", isAuthenticated, getUserRecommendations);

// Search recommendations by keyword
router.get("/search", isAuthenticated, searchRecommendations);

// Get single recommendation with full conversation
router.get("/:id", isAuthenticated, getRecommendation);

// Update recommendation (project name, metadata, etc.)
router.put("/:id", isAuthenticated, updateRecommendation);

// Clear conversation history for a recommendation
router.post("/:id/clear", isAuthenticated, clearConversationHistory);

// Delete recommendation
router.delete("/:id", isAuthenticated, deleteRecommendation);

export default router;
