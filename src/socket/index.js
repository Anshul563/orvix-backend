import { redis } from "../config/redis.js";
import { createRoom, getRoom } from "../mediasoup/rooms.js";
import { createRouter } from "../mediasoup/router.js";
import { createWorker } from "../mediasoup/worker.js";
import { createWebRtcTransport } from "../mediasoup/transport.js";
import { startRecording } from "../mediasoup/recording.js";
import { createAudioObserver } from "../mediasoup/audioObserver.js";
import { canControlOthers, isHost } from "../utils/permissions.js";
import { db } from "../database/index.js";
import { users as usersSchema } from "../database/schema.js";
import { eq } from "drizzle-orm";

let worker;

export const initSocket = async (io) => {
  worker = await createWorker();
  io.on("connection", (socket) => {
    console.log("User connected:", socket.id);

    let room;
    let roomId;
    let userId;

    socket.on("join-room", async ({ roomId: rId, userId: uId, name: uName }) => {
      roomId = rId;
      userId = uId;

      room = getRoom(roomId);

      if (!room) {
        const router = await createRouter(roomId, worker);
        const audioObserver = await createAudioObserver(router);
        room = createRoom(audioObserver, roomId, router);
        // 🔥 listen for active speaker
        audioObserver.on("volumes", (volumes) => {
          const { producer } = volumes[0];

          // find owner
          let speakerSocketId = null;

          room.peers.forEach((peer, socketId) => {
            if (peer.producers.find((p) => p.id === producer.id)) {
              speakerSocketId = socketId;
            }
          });

          io.to(roomId).emit("active-speaker", {
            producerId: producer.id,
            socketId: speakerSocketId,
          });
        });
      }

      let role;
      if (!room.peers.size) {
        // first user becomes host
        role = "host";
      } else {
        role = "participant";
      }

      let displayName = uName || `User ${socket.id.slice(0, 4)}`;

      // 🔥 Fetch actual name from DB if userId is provided
      if (uId) {
        try {
          const userRecord = await db.query.users.findFirst({
            where: eq(usersSchema.id, uId),
          });
          if (userRecord && userRecord.name) {
            displayName = userRecord.name;
          }
        } catch (e) {
          console.error("Failed to fetch user from DB:", e);
        }
      }

      room.peers.set(socket.id, {
        name: displayName,
        transports: [],
        producers: [],
        consumers: [],
        mediaState: { mic: true, camera: true },
        role,
        raisedHand: false,
        raisedAt: null,
        lastReaction: 0,
      });


      socket.emit("router-rtp-capabilities", room.router.rtpCapabilities);

      socket.join(roomId);
      await redis.sadd(`room:${roomId}:users`, userId);

      // 🔥 Broadcast detailed user list
      const usersMap = {};
      room.peers.forEach((peer, id) => {
        usersMap[id] = {
          name: peer.name,
          role: peer.role,
          mic: peer.mediaState.mic,
          camera: peer.mediaState.camera,
        };
      });

      io.to(roomId).emit("room-users", usersMap);
      socket.to(roomId).emit("user-joined", { userId, socketId: socket.id, name: uName });
    });


    // 🔥 2. Create Transport
    socket.on("create-transport", async (_, callback) => {
      if (!room) return callback({ error: "Room not joined" });
      const transport = await createWebRtcTransport(room.router);

      room.peers.get(socket.id).transports.push(transport);

      callback({
        id: transport.id,
        iceParameters: transport.iceParameters,
        iceCandidates: transport.iceCandidates,
        dtlsParameters: transport.dtlsParameters,
      });
    });

    // 🔥 3. Connect Transport
    socket.on("connect-transport", async ({ transportId, dtlsParameters }) => {
      if (!room) return;
      const transport = room.peers
        .get(socket.id)
        ?.transports.find((t) => t.id === transportId);

      if (transport) {
        await transport.connect({ dtlsParameters });
      }
    });

    // 🔥 4. Produce (send video/audio)
    socket.on(
      "produce",
      async ({ transportId, kind, rtpParameters, appData }, callback) => {
        if (!room) return callback({ error: "Room not joined" });
        const transport = room.peers
          .get(socket.id)
          ?.transports.find((t) => t.id === transportId);

        if (!transport) return callback({ error: "Transport not found" });
        const producer = await transport.produce({
          kind,
          rtpParameters,
          appData,
        });

        if (kind === "audio") {
          await room.audioObserver.addProducer({ producerId: producer.id });
        }

        room.peers.get(socket.id).producers.push(producer);

        // 🔥 notify others
        socket.to(roomId).emit("new-producer", {
          producerId: producer.id,
          socketId: socket.id,
          kind,
          type: appData?.type, // "camera" or "screen"
        });

        callback({ id: producer.id });
      },
    );

    // 🔥 CONSUME
    socket.on(
      "consume",
      async ({ producerId, transportId, rtpCapabilities }, callback) => {
        if (!room) return callback({ error: "Room not joined" });
        const router = room.router;

        if (!router.canConsume({ producerId, rtpCapabilities })) {
          return callback({ error: "Cannot consume" });
        }

        const transport = room.peers
          .get(socket.id)
          ?.transports.find((t) => t.id === transportId);

        if (!transport) return callback({ error: "Transport not found" });

        const consumer = await transport.consume({
          producerId,
          rtpCapabilities,
          paused: false,
        });

        room.peers.get(socket.id).consumers.push(consumer);

        callback({
          id: consumer.id,
          producerId,
          kind: consumer.kind,
          rtpParameters: consumer.rtpParameters,
        });
      },
    );

    // 🔥 GET EXISTING PRODUCERS
    socket.on("get-producers", (callback) => {
      if (!room) return callback([]);
      const producers = [];

      room.peers.forEach((peer, id) => {
        if (id !== socket.id) {
          peer.producers.forEach((p) => {
            producers.push({
              producerId: p.id,
              socketId: id,
            });
          });
        }
      });

      callback(producers);
    });

    socket.on("start-recording", async ({ roomId }) => {
      const room = getRoom(roomId);
      if (!room) return;

      const peer = room.peers.get(socket.id);
      if (!peer) return;

      // record first video producer (simplified)
      const producer = peer.producers.find((p) => p.kind === "video");

      if (!producer) {
        return socket.emit("recording-error", {
          message: "No video producer found",
        });
      }

      const recording = await startRecording(
        room.router,
        producer,
        `recordings/${roomId}-${Date.now()}`,
      );

      peer.recording = recording;

      socket.emit("recording-started");
    });

    socket.on("stop-recording", () => {
      if (!room) return;
      const peer = room.peers.get(socket.id);
      if (!peer) return;

      if (peer.recording) {
        peer.recording.consumer.close();
        peer.recording.transport.close();
        peer.recording.ffmpeg.kill("SIGINT");

        socket.emit("recording-stopped");
      }
    });

    socket.on("toggle-mic", ({ enabled }) => {
      if (!room) return;
      const peer = room.peers.get(socket.id);
      if (!peer) return;

      peer.mediaState.mic = enabled;

      // find audio producer
      const audioProducer = peer.producers.find((p) => p.kind === "audio");

      if (audioProducer) {
        if (enabled) {
          audioProducer.resume();
        } else {
          audioProducer.pause();
        }
      }

      // 🔥 broadcast state
      io.to(roomId).emit("user-media-updated", {
        socketId: socket.id,
        mic: enabled,
      });
    });

    socket.on("toggle-camera", ({ enabled }) => {
      if (!room) return;
      const peer = room.peers.get(socket.id);
      if (!peer) return;

      peer.mediaState.camera = enabled;

      const videoProducer = peer.producers.find((p) => p.kind === "video");

      if (videoProducer) {
        if (enabled) {
          videoProducer.resume();
        } else {
          videoProducer.pause();
        }
      }

      io.to(roomId).emit("user-media-updated", {
        socketId: socket.id,
        camera: enabled,
      });
    });

    socket.on("mute-user", ({ targetSocketId }) => {
      if (!room) return;
      const requester = room.peers.get(socket.id);
      if (!requester) return;

      if (!canControlOthers(requester)) return;

      const target = room.peers.get(targetSocketId);
      if (!target) return;

      const audioProducer = target.producers.find((p) => p.kind === "audio");

      if (audioProducer) {
        audioProducer.pause();
      }

      target.mediaState.mic = false;

      // notify target
      io.to(targetSocketId).emit("force-muted");

      // notify all
      io.to(roomId).emit("user-media-updated", {
        socketId: targetSocketId,
        mic: false,
      });
    });

    socket.on("disable-camera", ({ targetSocketId }) => {
      if (!room) return;
      const requester = room.peers.get(socket.id);
      if (!requester) return;

      if (!canControlOthers(requester)) return;

      const target = room.peers.get(targetSocketId);
      if (!target) return;

      const videoProducer = target.producers.find((p) => p.kind === "video");

      if (videoProducer) {
        videoProducer.pause();
      }

      target.mediaState.camera = false;

      io.to(targetSocketId).emit("camera-disabled");

      io.to(roomId).emit("user-media-updated", {
        socketId: targetSocketId,
        camera: false,
      });
    });

    socket.on("raise-hand", () => {
      if (!room) return;
      const peer = room.peers.get(socket.id);
      if (!peer) return;

      peer.raisedHand = true;
      peer.raisedAt = Date.now();

      io.to(roomId).emit("hand-raised", {
        socketId: socket.id,
        raisedAt: peer.raisedAt,
      });
    });

    socket.on("lower-hand", () => {
      if (!room) return;
      const peer = room.peers.get(socket.id);
      if (!peer) return;

      peer.raisedHand = false;
      peer.raisedAt = null;

      io.to(roomId).emit("hand-lowered", {
        socketId: socket.id,
      });
    });

    socket.on("get-raised-hands", (callback) => {
      const queue = [];

      room.peers.forEach((peer, id) => {
        if (peer.raisedHand) {
          queue.push({
            socketId: id,
            raisedAt: peer.raisedAt,
          });
        }
      });

      // sort by time
      queue.sort((a, b) => a.raisedAt - b.raisedAt);

      callback(queue);
    });

    socket.on("send-reaction", ({ emoji }) => {
      const peer = room.peers.get(socket.id);
      if (!peer) return;

      // prevent spam
      if (peer.lastReaction && Date.now() - peer.lastReaction < 1000) return;
      peer.lastReaction = Date.now();

      io.to(roomId).emit("reaction", {
        socketId: socket.id,
        emoji,
      });
    });

    socket.on("request-join", ({ roomId, user }) => {
      const room = getRoom(roomId);

      if (!room) return;

      room.waiting.set(socket.id, user);

      // notify host
      const host = [...room.peers.entries()].find(([, p]) => p.role === "host");

      if (host) {
        io.to(host[0]).emit("waiting-user", {
          socketId: socket.id,
          user,
        });
      }
    });

    socket.on("approve-user", ({ targetSocketId }) => {
      const requester = room.peers.get(socket.id);

      if (!requester || requester.role !== "host") return;

      const user = room.waiting.get(targetSocketId);
      if (!user) return;

      room.waiting.delete(targetSocketId);

      io.to(targetSocketId).emit("join-approved");
    });

    socket.on("reject-user", ({ targetSocketId }) => {
      const requester = room.peers.get(socket.id);

      if (!requester || requester.role !== "host") return;

      room.waiting.delete(targetSocketId);

      io.to(targetSocketId).emit("join-rejected");
    });

    socket.on("get-users-state", (callback) => {
      if (!room) return callback([]);
      const users = [];

      room.peers.forEach((peer, socketId) => {
        users.push({
          socketId,
          ...peer.mediaState,
          role: peer.role,
          raisedHand: peer.raisedHand,
          raisedAt: peer.raisedAt,
        });
      });

      callback(users);
    });

    socket.on("kick-user", ({ targetSocketId }) => {
      if (!room) return;
      const requester = room.peers.get(socket.id);
      if (!requester) return;

      if (!canControlOthers(requester)) return;

      io.to(targetSocketId).emit("kicked");

      io.sockets.sockets.get(targetSocketId)?.disconnect(true);
    });

    socket.on("make-cohost", ({ targetSocketId }) => {
      if (!room) return;
      const requester = room.peers.get(socket.id);
      if (!requester) return;

      if (!isHost(requester)) return;

      const target = room.peers.get(targetSocketId);
      if (!target) return;

      target.role = "co-host";

      io.to(roomId).emit("role-updated", {
        socketId: targetSocketId,
        role: "co-host",
      });
    });

    socket.on("mute-all", () => {
      if (!room) return;
      const requester = room.peers.get(socket.id);
      if (!requester) return;

      if (!canControlOthers(requester)) return;

      room.peers.forEach((peer, id) => {
        const audioProducer = peer.producers.find((p) => p.kind === "audio");

        if (audioProducer) audioProducer.pause();

        peer.mediaState.mic = false;

        io.to(id).emit("force-muted");
      });

      io.to(roomId).emit("all-muted");
    });

    socket.on("disconnect", async () => {
      if (!room) return;
      const peer = room.peers.get(socket.id);

      peer?.transports.forEach((t) => t.close());
      peer?.producers.forEach((p) => p.close());
      peer?.consumers.forEach((c) => c.close());

      room.peers.delete(socket.id);
      room.waiting.delete(socket.id);
      
      if (roomId && userId) {
        await redis.srem(`room:${roomId}:users`, userId);
        
        // 🔥 Broadcast updated detailed user list
        const usersMap = {};
        room.peers.forEach((peer, id) => {
          usersMap[id] = {
            name: peer.name,
            role: peer.role,
            mic: peer.mediaState.mic,
            camera: peer.mediaState.camera,
          };
        });

        io.to(roomId).emit("room-users", usersMap);
        socket.to(roomId).emit("user-left", socket.id);
      }

    });

    // WebRTC signaling
    socket.on("offer", ({ roomId, offer }) => {
      socket.to(roomId).emit("offer", offer);
    });

    socket.on("answer", ({ roomId, answer }) => {
      socket.to(roomId).emit("answer", answer);
    });

    socket.on("ice-candidate", ({ roomId, candidate }) => {
      socket.to(roomId).emit("ice-candidate", candidate);
    });
  });
};
