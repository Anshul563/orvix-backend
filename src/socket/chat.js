import { Chat } from "../modules/chat/chat.model.js";
import { pubClient, subClient } from "../config/redis.js";

export const initChat = (io) => {
  // 🔥 Redis Subscriber
  subClient.subscribe("chat");

  subClient.on("message", (channel, message) => {
    if (channel === "chat") {
      const data = JSON.parse(message);

      io.to(data.roomId).emit("chat-message", data);
    }
  });

  io.on("connection", (socket) => {
    // 💬 SEND MESSAGE
    socket.on("send-message", async ({ roomId, message, senderId }) => {
      const chat = await Chat.create({
        roomId,
        senderId,
        message,
      });

      const payload = {
        id: chat._id,
        roomId,
        senderId,
        message,
        createdAt: chat.createdAt,
      };

      // 🔥 publish to Redis
      await pubClient.publish("chat", JSON.stringify(payload));
    });
  });
};