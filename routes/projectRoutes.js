import express from "express";
import {
  createProject,
  deleteProject,
  getAllAdminProjects,
  getAllUserProjects,
  getProjectDetail,
  updateProject,
} from "../controllers/projectController.js";
import { isAuthenticated } from "../middleware/authMiddleware.js";
import uploadMiddleware from "../middleware/uploadFiles.js";

const router = express.Router();

// Create Project
router.post("/create", isAuthenticated, uploadMiddleware, createProject);

// Update Project
router.put("/update/:id", isAuthenticated, uploadMiddleware, updateProject);

// All User's Projects
router.get("/user", isAuthenticated, getAllUserProjects);

// Single Project
router.get("/project/:id", getProjectDetail);

// All Admin's Projects
router.get("/admin", getAllAdminProjects);

// Delete Project
router.delete("/delete/:id", isAuthenticated, deleteProject);

export default router;
