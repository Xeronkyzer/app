import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';

const app = express();
app.use(cors());

const httpServer = createServer(app);
const io = new Server(httpServer, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

// Room storage: { roomCode: { host: socketId, guest: socketId } }
const rooms: Map<string, { host: string; guest?: string }> = new Map();

// Generate a 6-digit room code
function generateRoomCode(): string {
    let code: string;
    do {
        code = Math.floor(100000 + Math.random() * 900000).toString();
    } while (rooms.has(code));
    return code;
}

io.on('connection', (socket) => {
    console.log(`[+] Client connected: ${socket.id}`);

    // Host creates a room
    socket.on('create-room', (callback) => {
        const roomCode = generateRoomCode();
        rooms.set(roomCode, { host: socket.id });
        socket.join(roomCode);
        console.log(`[Room] Created: ${roomCode} by ${socket.id}`);
        callback({ roomCode });
    });

    // Guest joins a room
    socket.on('join-room', (roomCode: string, callback) => {
        const room = rooms.get(roomCode);
        if (!room) {
            callback({ error: 'Room not found' });
            return;
        }
        if (room.guest) {
            callback({ error: 'Room is full' });
            return;
        }
        room.guest = socket.id;
        socket.join(roomCode);
        console.log(`[Room] ${socket.id} joined ${roomCode}`);

        // Notify host that guest has joined
        io.to(room.host).emit('guest-joined', { guestId: socket.id });
        callback({ success: true });
    });

    // Relay signaling messages (offer, answer, ice-candidate)
    socket.on('signal', ({ roomCode, data }) => {
        const room = rooms.get(roomCode);
        if (!room) return;

        // Relay to the other peer
        const target = socket.id === room.host ? room.guest : room.host;
        if (target) {
            io.to(target).emit('signal', data);
        }
    });

    // Handle disconnection
    socket.on('disconnect', () => {
        console.log(`[-] Client disconnected: ${socket.id}`);

        // Clean up rooms where this socket was host or guest
        for (const [code, room] of rooms.entries()) {
            if (room.host === socket.id || room.guest === socket.id) {
                // Notify the other peer
                const other = room.host === socket.id ? room.guest : room.host;
                if (other) {
                    io.to(other).emit('peer-disconnected');
                }
                rooms.delete(code);
                console.log(`[Room] Deleted: ${code}`);
            }
        }
    });
});

const PORT = process.env.PORT || 3001;
httpServer.listen(PORT, () => {
    console.log(`\n🚀 FalseFile Signaling Server running on port ${PORT}\n`);
});
