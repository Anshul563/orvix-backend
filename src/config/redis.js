import Redis from "ioredis";

export const pubClient = new Redis(process.env.REDIS_URL);
export const subClient = pubClient.duplicate();

// optional (for general use)
export const redis = new Redis(process.env.REDIS_URL);

pubClient.on("connect", () => console.log("🟢 Redis Pub Connected"));
subClient.on("connect", () => console.log("🟢 Redis Sub Connected"));