import mongoose from "mongoose";

const chatSchema = new mongoose.Schema(
  {
    chatName: {
      type: String,
      trim: true,
      required: true,
    },
    projectId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "projects",
    },
    isGroupChat: {
      type: Boolean,
      default: false,
    },
    users: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "users",
      },
    ],
    groupAdmin: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    avatar: {
      type: String,
      default:
        "https://icon-library.com/images/anonymous-avatar-icon/anonymous-avatar-icon-25.jpg",
    },
    latestMessage: {
      type: Object,
      type: mongoose.Schema.Types.ObjectId,
      ref: "Messages",
    },
    unreadMessageCount: {
      type: Map,
      of: Number,
      default: {},
    },
  },
  { timestamps: true }
);

export default mongoose.model("Chat", chatSchema);
