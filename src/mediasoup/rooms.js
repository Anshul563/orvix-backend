export const rooms = new Map();

export const getRoom = (roomId) => rooms.get(roomId);
export const createRoom = (audioObserver, roomId, router) => {
  const room = {
    router,
    audioObserver,
    peers: new Map(),
    waiting: new Map(),
  };

  rooms.set(roomId, room);
  return room;
};
