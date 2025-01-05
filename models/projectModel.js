import mongoose from "mongoose";

// Review Schema
const reviewSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "users",
    },
    rating: {
      type: Number,
      required: true,
      min: 0,
      max: 5,
      default: 0,
    },
    comment: {
      type: String,
      trim: true,
      maxlength: 500,
    },
    commentReplies: [
      {
        user: { type: mongoose.Schema.Types.ObjectId, ref: "users" },
        comment: { type: String, trim: true, maxlength: 500 },
        createdAt: { type: Date, default: Date.now },
      },
    ],
  },
  { timestamps: true }
);

const projectSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "users",
      required: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
    },
    thumbnails: [],
    budget: {
      type: String,
      required: true,
      min: 0,
      default: 0,
    },
    totalPrice: {
      type: String,
      min: 0,
      default: 0,
    },
    dealer_quoted_price: {
      type: String,
      min: 0,
      default: 0,
    },
    price_difference: {
      type: String,
      default: 0,
    },
    variance_budget: {
      type: String,
      default: 0,
    },
    quality: {
      type: String,
      default: "",
    },
    total_area: {
      type: String,
      default: 0,
    },
    sum_area: {
      type: String,
      default: "",
    },
    connect_users: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "users",
      },
    ],
    reviews: [reviewSchema],
    ratings: {
      type: Number,
      default: 0,
    },
    status: {
      type: Boolean,
      default: true,
    },
    category: {
      type: String,
    },
  },
  { timestamps: true }
);

export default mongoose.model("projects", projectSchema);
