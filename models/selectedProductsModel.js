import mongoose from "mongoose";

const selectedProductsSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "users",
    },
    products: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Product",
      },
    ],
    project: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "projects",
    },
  },
  { timestamps: true }
);

export default mongoose.model("SelectedProducts", selectedProductsSchema);
