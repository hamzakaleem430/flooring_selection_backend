import express from "express";
import { isAdmin, isAuthenticated } from "../middleware/authMiddleware.js";
import uploadMiddleware from "../middleware/uploadFiles.js";
import {
  createProduct,
  deleteProduct,
  getAllProducts,
  getDealerProducts,
  getProductByQRCode,
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

// Delete All Products
router.delete("/deleteAllUsers", isAuthenticated, isAdmin);

// Get Product by Scanned QR Code
router.get("/qrcode", getProductByQRCode);

// Get Complete Coordinates
// router.get("/getCompleteCoordinates", getCompleteCoordinates);

export default router;
