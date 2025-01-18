import express from "express";
import { isAuthenticated } from "../middleware/authMiddleware.js";
import uploadMiddleware from "../middleware/uploadFiles.js";
import {
  createProduct,
  deleteProduct,
  getAllProducts,
  getDealerProducts,
  getProductDetail,
  updateProduct,
} from "../controllers/productController.js";

const router = express.Router();

// Create Product
router.post("/create", isAuthenticated, uploadMiddleware, createProduct);

// Update Product
router.put("/update/:id", isAuthenticated, uploadMiddleware, updateProduct);

// Get Product - dealer
router.get("/get/:id", getDealerProducts);

// Get All Products
router.get("/getAll", getAllProducts);

// Product Detail
router.get("/productDetail/:id", getProductDetail);

// Delete Product
router.delete("/delete/:id", isAuthenticated, deleteProduct);

export default router;
