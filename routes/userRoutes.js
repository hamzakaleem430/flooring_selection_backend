import express from "express";
import {
  addReview,
  addReviewReply,
  addUser,
  deleteAllUsers,
  deleteUser,
  getAllProjectrequests,
  getAllUsers,
  getReviews,
  getUserDetail,
  loginUser,
  register,
  resetPassword,
  socialAuth,
  updateAccessToken,
  updatePassword,
  updateUserProfile,
  uploadFiles,
  verificationUser,
} from "../controllers/userController.js";
import uploadMiddleware from "../middleware/uploadFiles.js";
import { isAdmin, isAuthenticated } from "../middleware/authMiddleware.js";

const router = express.Router();

// Register
router.post("/register", uploadMiddleware, register);

// Email Verification
router.post("/email-verification", verificationUser);

// Login
router.post("/login", loginUser);

// Social Login
router.post("/socialAuth", socialAuth);

// Update Access Token
router.get("/refresh", updateAccessToken);

// Get ALl User
router.get("/all", getAllUsers);

// Get Single User
router.get("/userDetail/:id", getUserDetail);

// Update Profile
router.put(
  "/update/profile/:id",
  isAuthenticated,
  uploadMiddleware,
  updateUserProfile
);

// Reset Password
router.post("/reset/Password", resetPassword);

// Update Password
router.put("/update/Password", updatePassword);

// Add User From Admin-Panel
router.post("/addUser", isAuthenticated, isAdmin, addUser);

// Delete User
router.delete("/deleteUser/:id", isAuthenticated, isAdmin, deleteUser);

// Delete All Users
router.delete("/deleteAllUsers", isAuthenticated, isAdmin, deleteAllUsers);

// Add Review
router.post("/addReview/:id", isAuthenticated, addReview);

// Add Reply To Review
router.post("/addReply/:id", isAuthenticated, addReviewReply);

// Get Reviews
router.get("/getReviews/:id", isAuthenticated, getReviews);

// Upload Files (with authentication for security)
router.post("/upload/file", isAuthenticated, uploadMiddleware, uploadFiles);

// Get All Project Requests
router.get("/getAllProjects/:id", getAllProjectrequests);

export default router;
