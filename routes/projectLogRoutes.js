import express from "express";
import { getProjectLogs } from "../controllers/projectLogController.js";
import { isAuthenticated } from "../middleware/authMiddleware.js";

const router = express.Router();

// Get logs for a project
router.get("/:projectId", isAuthenticated, getProjectLogs);

export default router;

