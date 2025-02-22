import express from "express";
import { isAuthenticated } from "../middleware/authMiddleware.js";
import {
  createSelectedProducts,
  getAllSelectedProductsByDealer,
  getAllSelectedProductsByUser,
} from "../controllers/selectedProductController.js";

const router = express.Router();

// Create Selected Products
router.post("/create", isAuthenticated, createSelectedProducts);

// Get All Selected Products- User
router.get("/user/:id", getAllSelectedProductsByUser);

// Get All Selected Products- Dealer
router.get("/dealer/:id", getAllSelectedProductsByDealer);

export default router;
