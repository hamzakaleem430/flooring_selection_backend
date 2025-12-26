import mongoose from "mongoose";

const projectLogSchema = new mongoose.Schema(
  {
    project: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "projects",
      required: true,
    },
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "users",
      required: true,
    },
    action: {
      type: String,
      required: true,
      enum: [
        "created",
        "status_changed",
        "product_suggested",
        "product_removed_from_suggestions",
        "product_added_to_selected",
        "product_removed_from_selected",
        "quantity_updated",
        "price_updated",
        "label_updated",
        "project_updated",
      ],
    },
    description: {
      type: String,
      required: true,
    },
    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
  },
  { timestamps: true }
);

// Index for faster queries
projectLogSchema.index({ project: 1, createdAt: -1 });

export default mongoose.model("ProjectLog", projectLogSchema);

