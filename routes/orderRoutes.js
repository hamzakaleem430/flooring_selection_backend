import express from "express";
import { isAuthenticated } from "../middleware/authMiddleware.js";
import {
  createOrder,
  getOrder,
  getUserOrders,
  getDealerOrders,
  updateOrderStatus,
  addUserSignature,
  addDealerSignature,
  generateInvoice,
  updateOrder,
  deleteOrder,
} from "../controllers/orderController.js";

const router = express.Router();

// Create order from selected products
router.post("/create", isAuthenticated, createOrder);

// Get single order
router.get("/:id", isAuthenticated, getOrder);

// Get user orders
router.get("/user/:userId", isAuthenticated, getUserOrders);

// Get dealer orders
router.get("/dealer/:dealerId", isAuthenticated, getDealerOrders);

// Update order status
router.put("/:id/status", isAuthenticated, updateOrderStatus);

// Add user signature
router.put("/:id/user-signature", isAuthenticated, addUserSignature);

// Add dealer signature
router.put("/:id/dealer-signature", isAuthenticated, addDealerSignature);

// Generate invoice
router.post("/:id/generate-invoice", isAuthenticated, generateInvoice);

// Update order details
router.put("/:id", isAuthenticated, updateOrder);

// Delete order
router.delete("/:id", isAuthenticated, deleteOrder);

export default router;
