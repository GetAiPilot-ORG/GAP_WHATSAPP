import { createServer } from "http";
import app from "./src/app.js";
import { initSocket } from "./src/socket.js";
import { startCronJobs } from "./src/cron.js";
import * as fs from "fs";

const PORT = Number(process.env.PORT || 3001);

const corsOrigins = (origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) => {
    if (!origin) return callback(null, true);
    const allowedStatic = [
        "http://localhost:5173", "http://localhost:5174", "http://localhost:3000",
        "https://wb.getaipilot.in", "https://w.getaipilot.in", "https://mail.getaipilot.in"
    ];
    if (
        allowedStatic.includes(origin) ||
        origin.startsWith("http://localhost:") ||
        origin.startsWith("https://localhost:") ||
        origin.endsWith(".ngrok-free.dev") ||
        origin.endsWith(".vercel.app")
    ) {
        return callback(null, true);
    }
    return callback(null, true);
};
    
const corsAllowedHeaders = [
    "Content-Type", "Authorization", "ngrok-skip-browser-warning", "bypass-tunnel-reminder"
];

// 1. Create HTTP Server
const httpServer = createServer(app);

// 2. Init Socket.io
initSocket(httpServer, corsOrigins, corsAllowedHeaders);

// 3. Start Cron Jobs
startCronJobs();

// 4. Import Baileys Socket Handlers dynamically to avoid ESM hoisting before initSocket
await import('./src/services/baileys.service.js');

// 5. Start HTTP Server
httpServer.listen(PORT, () => {
    console.log(`✅ Server running on port ${PORT}`);
    if (!fs.existsSync("baileys_auth_info")) {
        fs.mkdirSync("baileys_auth_info");
    }
});

httpServer.on('error', (err: any) => {
    if (err?.code === 'EADDRINUSE') {
        console.error(`❌ Port ${PORT} is already in use.`);
        process.exit(1);
    }
    console.error('❌ Server error:', err);
    process.exit(1);
});

// Global crash handlers
process.on('uncaughtException', (err: any) => {
    console.error('❌ Uncaught Exception:', err);
    if (err.message && (err.message.includes('Connection Closed') || err.message.includes('Bad MAC'))) {
        try {
            if (fs.existsSync('baileys_auth_info')) {
                fs.rmSync('baileys_auth_info', { recursive: true, force: true });
                console.log("⚠️ Corrupted session cleared.");
            }
        } catch (e) { console.error("Cleanup failed:", e); }
    }
});

process.on('unhandledRejection', (reason: any, promise) => {
    console.error('❌ Unhandled Rejection:', reason);
    if (reason && (reason.output?.statusCode === 428 || reason.message?.includes('Connection Closed'))) {
        try {
            if (fs.existsSync('baileys_auth_info')) {
                fs.rmSync('baileys_auth_info', { recursive: true, force: true });
                console.log("⚠️ Corrupted session cleared.");
            }
        } catch (e) { console.error("Cleanup failed:", e); }
    }
});
