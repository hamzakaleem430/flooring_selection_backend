import mongoose from "mongoose";

const selectedProductsSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "users",
    },
    products: [
      {
        product: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "Product",
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
    ],
    project: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "projects",
    },
  },
  { timestamps: true }
);

export default mongoose.model("SelectedProducts", selectedProductsSchema);
