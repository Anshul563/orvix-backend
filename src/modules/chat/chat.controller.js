import { Chat } from "./chat.model.js";

export const getMessages = async (req, res) => {
  const { roomId } = req.params;
  const { page = 1, limit = 20 } = req.query;

  const messages = await Chat.find({ roomId })
    .sort({ createdAt: -1 })
    .skip((page - 1) * limit)
    .limit(Number(limit));

  res.json(messages.reverse());
};