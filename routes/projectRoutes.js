import express from "express";
import {
  acceptFollowRequest,
  cancelFollowRequest,
  connectUserToProject,
  createProject,
  deleteAllProjects,
  deleteProject,
  disconnectUserFromProject,
  getAllAdminProjects,
  getAllUserProjects,
  getProjectDetail,
  sendRequestToUser,
  updateProject,
} from "../controllers/projectController.js";
import { isAdmin, isAuthenticated } from "../middleware/authMiddleware.js";
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

// Delete All Projects
router.put("/deleteAll/projects", isAuthenticated, isAdmin, deleteAllProjects);

// Send Request to User
router.put("/sendRequest/:id", isAuthenticated, sendRequestToUser);

// Accept Follow request
router.put("/accept", isAuthenticated, acceptFollowRequest);

// Reject Request
router.put("/reject", isAuthenticated, cancelFollowRequest);

// Connect User to Project
router.put("/connect/:id", isAuthenticated, connectUserToProject);

// Disconnect User from Project
router.put("/disconnect/:id", isAuthenticated, disconnectUserFromProject);

export default router;
