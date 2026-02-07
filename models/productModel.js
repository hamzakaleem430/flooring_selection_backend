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
    category: {
      type: String,
      trim: true,
    },
    seriesName: {
      type: String,
      trim: true,
    },
    cost: {
      type: Number,
      default: 0,
    },
    margin: {
      type: Number,
      default: 0,
    },
    profitType: {
      type: String,
      enum: ["markup", "margin"],
      default: "markup",
    },
    marginLocked: {
      type: Boolean,
      default: false,
    },
    sellingPrice: {
      type: Number,
      default: 0,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    variations: [
      {
        type: { type: String },
        options: { type: [String] },
        images: { type: [[String]], default: [] }, // Array of arrays for images per option
      },
    ],
    qr_code: { 
      type: String, 
      unique: true,
      trim: true,
      sparse: true  // Allow multiple null values for unique index
    },
    qr_code_image: { type: String },
    reviews: [
      {
        user: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "users",
          required: true,
        },
        rating: {
          type: Number,
          required: true,
          min: 1,
          max: 5,
        },
        comment: {
          type: String,
          trim: true,
          maxlength: 1000,
        },
        createdAt: {
          type: Date,
          default: Date.now,
        },
      },
    ],
    averageRating: {
      type: Number,
      default: 0,
      min: 0,
      max: 5,
    },
    totalReviews: {
      type: Number,
      default: 0,
    },
  },
  { timestamps: true }
);

export default mongoose.model("Product", productSchema);
