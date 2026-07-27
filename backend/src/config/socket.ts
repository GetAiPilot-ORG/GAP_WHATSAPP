import { Server } from 'socket.io';
import { io } from '../socket.js';

let ioInstance: Server | null = null;

export function initSocket(server: any) {
    ioInstance = new Server(server, {
        cors: {
            origin: '*',
            methods: ['GET', 'POST']
        }
    });
    return ioInstance;
}

export function getIO(): Server {
    // Bridge to return the active socket.io server initialized in src/socket.ts
    if (io) {
        return io;
    }
    if (!ioInstance) {
        throw new Error('Socket.io has not been initialized. Call initSocket first.');
    }
    return ioInstance;
}

