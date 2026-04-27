import express from "express";
import cors from "cors";
import morgan from "morgan";
import { protect } from "./middleware/auth.js";
import authRoutes from "./modules/auth/auth.routes.js";
import meetingRoutes from "./modules/meeting/meeting.routes.js";
import chatRoutes from "./modules/chat/chat.routes.js";


const app = express();

app.use(cors());
app.use(express.json());
app.use(morgan("dev"));

app.get("/", (req, res) => {
  res.send("Orvix Backend Running 🚀");
});

// routes
app.use("/api/auth", authRoutes);
app.use("/api/meetings", protect, meetingRoutes);
app.use("/api/chat", chatRoutes);

export default app;
