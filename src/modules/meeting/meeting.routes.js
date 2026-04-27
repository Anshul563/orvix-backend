import express from "express";
import { createMeeting, getMeetings } from "./meeting.controller.js";

const router = express.Router();

router.post("/create", createMeeting);
router.get("/", getMeetings);


export default router;