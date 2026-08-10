import { Server } from "socket.io";

export let io: Server;

export function initSocket(
    httpServer: any,
    corsOrigins: string[] | ((origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) => void),
    corsAllowedHeaders: string[]
) {
    io = new Server(httpServer, {
        cors: {
            origin: corsOrigins,
            methods: ["GET", "POST", "PATCH"],
            allowedHeaders: corsAllowedHeaders,
            credentials: true
        },
    });
    return io;
}
