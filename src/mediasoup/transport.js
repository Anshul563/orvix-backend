export const createWebRtcTransport = async (router) => {
  const transport = await router.createWebRtcTransport({
    listenIps: [
      { 
        ip: "0.0.0.0", 
        announcedIp: process.env.PUBLIC_IP || "127.0.0.1" 
      }
    ],
    enableUdp: true,
    enableTcp: true,
    preferUdp: true,
  });


  return transport;
};