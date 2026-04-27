import express from "express";
import { getMessages } from "./chat.controller.js";
import { protect } from "../../middleware/auth.js";

const router = express.Router();

router.get("/:roomId", protect, getMessages);

export default router;
