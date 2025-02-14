import express from "express";
import {
  createSuggestedProduct,
  getSuggestedProducts,
} from "../controllers/suggestedProductControler.js";
import { isAuthenticated } from "../middleware/authMiddleware.js";

const router = express.Router();

router.post("/add", isAuthenticated, createSuggestedProduct);

router.get("/:id", getSuggestedProducts);

export default router;
