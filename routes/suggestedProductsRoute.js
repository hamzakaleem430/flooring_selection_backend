import express from "express";
import {
  createSuggestedProduct,
  getSuggestedProducts,
} from "../controllers/suggestedProductControler.js";
import { isAuthenticated } from "../middleware/authMiddleware.js";

const router = express.Router();

router.post("/suggestedProducts", isAuthenticated, createSuggestedProduct);

router.get("/suggestedProducts/:id", getSuggestedProducts);

export default router;
