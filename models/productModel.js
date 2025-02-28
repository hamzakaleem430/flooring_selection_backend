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
    },
    images: {
      type: [String],
      default: [],
    },
    brand: {
      type: String,
      trim: true,
    },
    variations: [
      {
        type: { type: String },
        options: { type: [String] },
      },
    ],
    qr_code: { type: String, unique: true },
    qr_code_image: { type: String },
  },
  { timestamps: true }
);

export default mongoose.model("Product", productSchema);
