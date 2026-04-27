import mediasoup from "mediasoup";

let worker;

export const createWorker = async () => {
  worker = await mediasoup.createWorker({
    rtcMinPort: 2000,
    rtcMaxPort: 2020,
  });

  console.log("✅ Mediasoup Worker created");

  return worker;
};

export const getWorker = () => worker;