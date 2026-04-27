import mongoose from "mongoose";

const chatSchema = new mongoose.Schema(
  {
    roomId: String,
    senderId: String,
    message: String,
    type: {
      type: String,
      default: "text", // text | file | system
    },
  },
  { timestamps: true }
);

export const Chat = mongoose.model("Chat", chatSchema);