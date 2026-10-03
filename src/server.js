require("dotenv").config();

const express = require("express");
const { createServer } = require("http");
const { Server } = require("socket.io");
const Redis = require("ioredis");

const app = express();

app.use(express.json());

const httpServer = createServer(app);

const redisCache = new Redis({
    host: process.env.REDIS_HOST || "127.0.0.1",
    port: Number(process.env.REDIS_PORT || 6379)
});

redisCache.on("connect", () => {
    console.log("Socket Service connected to Redis");
});

redisCache.on("error", (error) => {
    console.error("Socket Service Redis error:", error);
});

const io = new Server(httpServer, {
    cors: {
        origin: [
            process.env.FRONTEND_URL ||
                "http://localhost:5173",
            "http://localhost:5500"
        ],
        methods: ["GET", "POST"]
    }
});

io.on("connection", (socket) => {
    console.log("Socket client connected:", socket.id);

    socket.on("setUserId", async (userId) => {
        if (!userId) {
            console.warn(
                "Ignoring socket registration without userId"
            );

            return;
        }

        await redisCache.set(
            `socket:user:${userId}`,
            socket.id
        );

        console.log(
            `Mapped userId ${userId} to socket ${socket.id}`
        );
    });

    socket.on("getConnectionId", async (userId) => {
        const connectionId = await redisCache.get(
            `socket:user:${userId}`
        );

        socket.emit("connectionId", connectionId);
    });

    socket.on("disconnect", async () => {
        console.log(
            "Socket client disconnected:",
            socket.id
        );
    });
});

app.post("/sendPayload", async (req, res) => {
    try {
        const { userId, payload } = req.body;

        if (!userId || !payload) {
            return res.status(400).json({
                success: false,
                message:
                    "userId and payload are required"
            });
        }

        const socketId = await redisCache.get(
            `socket:user:${userId}`
        );

        if (!socketId) {
            return res.status(404).json({
                success: false,
                message: "User is not connected"
            });
        }

        io.to(socketId).emit(
            "submissionPayloadResponse",
            payload
        );

        console.log(
            "Submission payload emitted:",
            {
                userId,
                socketId,
                submissionId: payload.submissionId,
                status: payload.status
            }
        );

        return res.status(200).json({
            success: true,
            message: "Payload sent successfully"
        });
    } catch (error) {
        console.error(
            "Failed to send socket payload:",
            error
        );

        return res.status(500).json({
            success: false,
            message: "Failed to send payload"
        });
    }
});

httpServer.listen(
    Number(process.env.PORT || 3001),
    () => {
        console.log(
            `Socket Service running on port ${
                process.env.PORT || 3001
            }`
        );
    }
);