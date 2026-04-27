const routers = new Map();

export const createRouter = async (roomId, worker) => {
  const router = await worker.createRouter({
    mediaCodecs: [
      {
        kind: "audio",
        mimeType: "audio/opus",
        clockRate: 48000,
        channels: 2,
      },
      {
        kind: "video",
        mimeType: "video/VP8",
        clockRate: 90000,
      },
    ],
  });

  routers.set(roomId, router);
  return router;
};

export const getRouter = (roomId) => routers.get(roomId);