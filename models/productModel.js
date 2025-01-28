import mongoose from "mongoose";

const productSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "users",
    },
    name: {
      type: String,
      required: [true, "Product name is required"],
      trim: true,
      minlength: [3, "Product name must be at least 3 characters long"],
    },
    description: {
      type: String,
      required: [true, "Product description is required"],
      trim: true,
      minlength: [
        10,
        "Product description must be at least 10 characters long",
      ],
    },
    price: {
      type: Number,
      required: [true, "Product price is required"],
      min: [0, "Price must be a positive value"],
    },
    images: {
      type: [String],
      default: [],
    },
    brand: {
      type: String,
      required: [true, "Brand is required"],
      trim: true,
    },
    variations: [
      {
        type: { type: String, required: true },
        options: { type: [String], required: true },
      },
    ],
    qr_code: {
      type: String,
      unique: true,
      trim: true,
    },
  },
  { timestamps: true }
);

export default mongoose.model("Product", productSchema);
