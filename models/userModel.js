import mongoose from "mongoose";
import jwt from "jsonwebtoken";
import dotenv from "dotenv";
dotenv.config();

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

const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
    },
    email: {
      type: String,
      required: true,
    },
    password: {
      type: String,
    },
    category: {
      type: String,
    },
    profileImage: {
      type: String,
    },
    reviews: [reviewSchema],
    ratings: {
      type: Number,
      default: 0,
    },
    nextAvailable: {
      type: String,
    },
    experience: {
      type: String,
      default: "",
    },
    status: {
      type: Boolean,
      default: true,
    },
    user_Status: {
      type: String,
      default: "pending",
    },
    isOnline: {
      type: Boolean,
      default: false,
    },
    projects: {
      type: Number,
      default: 0,
    },
    role: {
      type: String,
      default: "user",
    },
    passwordResetToken: {
      type: String,
      default: null,
    },
    passwordResetTokenExpire: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true }
);

// Sign Access Token
userSchema.methods.SignAccessToken = function () {
  if (!process.env.ACCESS_TOKEN) {
    throw new Error("ACCESS_TOKEN is not defined in the environment variables");
  }
  return jwt.sign({ id: this._id }, process.env.ACCESS_TOKEN, {
    expiresIn: "5m",
  });
};

// Sign Refresh Token
userSchema.methods.SignRefreshToken = function () {
  if (!process.env.REFRESH_TOKEN) {
    throw new Error(
      "REFRESH_TOKEN is not defined in the environment variables"
    );
  }
  return jwt.sign({ id: this._id }, process.env.REFRESH_TOKEN, {
    expiresIn: "7d",
  });
};

export default mongoose.model("users", userSchema);
