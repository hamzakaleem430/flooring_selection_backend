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
    quantity: {
      type: Number,
      default: 1,
      min: 1,
    },
    suggestedPrice: {
      type: Number,
      default: null,
    },
    label: {
      type: String,
      default: "",
    },
  },
  { timestamps: true }
);

export default mongoose.model(
  "suggestedProductModal",
  suggestedProductModalSchema
);
