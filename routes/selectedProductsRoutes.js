import express from "express";
import { isAuthenticated } from "../middleware/authMiddleware.js";
import {
  createSelectedProducts,
  getAllSelectedProductsByDealer,
  getAllSelectedProductsByUser,
  updateSelectedProductQuantity,
  removeSelectedProduct,
  updateSelectedProductSuggestedPrice,
} from "../controllers/selectedProductController.js";

const router = express.Router();

// Create Selected Products
router.post("/create", isAuthenticated, createSelectedProducts);

// Get All Selected Products- User
router.get("/user/:id", getAllSelectedProductsByUser);

// Get All Selected Products- Dealer
router.get("/dealer/:id", getAllSelectedProductsByDealer);

// Update Selected Product Quantity
router.put("/quantity/:projectId/:productId", isAuthenticated, updateSelectedProductQuantity);

// Update Selected Product Suggested Price
router.put("/price/:projectId/:productId", isAuthenticated, updateSelectedProductSuggestedPrice);

// Remove Product from Selected List
router.delete("/:projectId/:productId", isAuthenticated, removeSelectedProduct);

export default router;
