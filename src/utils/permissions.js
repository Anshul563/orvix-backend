export const isHost = (peer) => peer.role === "host";

export const canControlOthers = (peer) =>
  peer.role === "host" || peer.role === "co-host";