import mongoose from "mongoose";
import { Schema } from "mongoose";

const suggestedProductModalSchema = new Schema(
  {
    product: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Product",
    },
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "users",
    },
    project: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "projects",
    },
  },
  { timestamps: true }
);

export default mongoose.model(
  "suggestedProductModal",
  suggestedProductModalSchema
);
