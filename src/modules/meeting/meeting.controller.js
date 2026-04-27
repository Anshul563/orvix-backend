import { db } from "../../database/index.js";
import { meetings } from "../../database/schema.js";
import { eq, desc } from "drizzle-orm";

export const getMeetings = async (req, res) => {
  const userId = req.user.id;

  const userMeetings = await db
    .select()
    .from(meetings)
    .where(eq(meetings.hostId, userId))
    .orderBy(desc(meetings.createdAt));

  res.json(userMeetings);
};


export const createMeeting = async (req, res) => {
  const { title, description, startTime } = req.body;
  const userId = req.user.id;

  const meeting = await db.insert(meetings).values({
    title,
    description,
    hostId: userId,
    startTime: startTime ? new Date(startTime) : null,
  }).returning();

  res.json({
    meeting,
    joinUrl: `${process.env.FRONTEND_URL || "http://localhost:3000"}/meet/${meeting[0].id}`,
  });
};
