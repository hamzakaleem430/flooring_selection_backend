import mongoose from "mongoose";

const notificationSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "users",
    },
    subject: {
      type: String,
      required: true,
    },
    context: {
      type: String,
      required: true,
    },
    status: {
      type: String,
      default: "unread",
    },
    type: {
      type: String,
    },
    redirectLink: {
      type: String,
    },
  },
  { timestamps: true }
);

export default mongoose.model("notifications", notificationSchema);
