import "dotenv/config";
import app from "./app.js";
import http from "http";
import { Server } from "socket.io";
import { pubClient, subClient } from "./config/redis.js";
import { createAdapter } from "@socket.io/redis-adapter";

const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: process.env.FRONTEND_URL || "http://localhost:3000",
  },
});


// 🔥 Redis Adapter (IMPORTANT)
io.adapter(createAdapter(pubClient, subClient));

// socket setup
import { initSocket } from "./socket/index.js";
import { initChat } from "./socket/chat.js";
import { connectMongo } from "./database/mongo.js";
initSocket(io);
initChat(io);
connectMongo();
const PORT = process.env.PORT || 5000;

server.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
