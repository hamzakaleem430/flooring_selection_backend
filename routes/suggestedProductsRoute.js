import express from "express";
import {
  createSuggestedProduct,
  getSuggestedProducts,
  updateSuggestedProductQuantity,
  deleteSuggestedProduct,
} from "../controllers/suggestedProductControler.js";
import { isAuthenticated } from "../middleware/authMiddleware.js";

const router = express.Router();

router.post("/add", isAuthenticated, createSuggestedProduct);

router.get("/:id", getSuggestedProducts);

router.put("/quantity/:id", isAuthenticated, updateSuggestedProductQuantity);

router.delete("/:id", isAuthenticated, deleteSuggestedProduct);

export default router;
