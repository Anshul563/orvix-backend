import { spawn } from "child_process";
import fs from "fs";
import path from "path";

export const startRecording = async (router, producer, fileName) => {
  const dir = path.dirname(fileName);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  // 🔥 create plain transport
  const transport = await router.createPlainTransport({
    listenIp: "127.0.0.1",
    rtcpMux: false,
    comedia: true,
  });

  const rtpPort = transport.tuple.localPort;
  const rtcpPort = transport.rtcpTuple.localPort;

  // 🔥 consume producer
  const consumer = await transport.consume({
    producerId: producer.id,
    rtpCapabilities: router.rtpCapabilities,
    paused: false,
  });

  // 🔥 FFmpeg process
  const ffmpeg = spawn("ffmpeg", [
    "-protocol_whitelist", "file,udp,rtp",
    "-f", "rtp",
    "-i", `rtp://127.0.0.1:${rtpPort}`,
    "-c:v", "libx264",
    "-preset", "veryfast",
    "-y",
    `${fileName}.mp4`,
  ]);

  ffmpeg.stderr.on("data", (data) => {
    console.log(`FFmpeg: ${data}`);
  });

  ffmpeg.on("close", () => {
    console.log("Recording finished");
  });

  return { transport, consumer, ffmpeg };
};