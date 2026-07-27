import express from 'express';
import cors from 'cors';
import dotenv from "dotenv";
import path from 'path';

import billingRoutes from './routes/billing.routes.js';
import broadcastRoutes from './routes/broadcast.routes.js';
import contactsRoutes from './routes/contacts.routes.js';
import conversationsRoutes from './routes/conversations.routes.js';
import dashboardRoutes from './routes/dashboard.routes.js';
import flowsRoutes, { flowSessionsRouter } from './routes/flows.routes.js';
import flowTemplateStarsRoutes from './routes/flow-template-stars.routes.js';
import messagesRoutes from './routes/messages.routes.js';
import agentsRoutes from './routes/agents.routes.js';
import settingsRoutes from './routes/settings.routes.js';
import teamRoutes from './routes/team.routes.js';
import twilioRoutes from './routes/twilio.routes.js';
import waRoutes from './routes/wa.routes.js';
import whatsappRoutes from './routes/whatsapp.routes.js';
import webhookRoutes from './routes/webhook.routes.js';
import googleAuthRoutes from './routes/googleAuth.routes.js';
import appointmentsRoutes from './routes/appointments.routes.js';

dotenv.config({ path: "./.env" });

export const app = express();

const extraCorsOrigins = String(process.env.CORS_ORIGINS || '')
    .split(',')
    .map(origin => origin.trim())
    .filter(Boolean);

const publicBaseUrl = process.env.PUBLIC_BASE_URL ? String(process.env.PUBLIC_BASE_URL).trim() : null;

export const corsOrigins = [
    "http://localhost:3000",
    "https://localhost:3000",
    "http://localhost:5173",
    "https://localhost:5173",
    "http://localhost:3001",
    "https://localhost:3001",
    ...(publicBaseUrl ? [publicBaseUrl] : []),
    "https://w.getaipilot.in",
    "https://wb.getaipilot.in",
    "https://mail.getaipilot.in",
    ...extraCorsOrigins
];

export const corsAllowedHeaders = [
    "Content-Type",
    "Authorization",
    "X-Auth-Portal",
    "X-N8N-Secret",
    "ngrok-skip-browser-warning"
];

app.use(cors({
    origin: (origin, callback) => {
        if (!origin) return callback(null, true);
        if (corsOrigins.includes(origin) || origin.startsWith("http://localhost:") || origin.startsWith("https://localhost:") || origin.endsWith(".ngrok-free.dev") || origin.endsWith(".vercel.app")) {
            return callback(null, true);
        }
        return callback(null, true);
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: corsAllowedHeaders
}));

// CSV-backed campaigns can contain up to 10K recipients. Keep the larger body
// allowance scoped to broadcast routes instead of widening every API endpoint.
app.use(
    '/api/broadcasts',
    express.json({
        limit: process.env.BROADCAST_JSON_LIMIT || '5mb',
        verify: (req: any, _res, buf) => {
            req.rawBody = buf;
        },
    }),
    broadcastRoutes,
);
app.use(
    express.json({
        verify: (req: any, _res, buf) => {
            req.rawBody = buf;
        },
    })
);

app.get("/", (_req, res) => {
    res.status(200).json({
        success: true,
        message: "GAP WhatsApp Backend is running",
        service: "GAP_WHATSAPP",
        version: "1.0.0",
        timestamp: new Date().toISOString(),
    });
});

app.get("/api/health", (_req, res) => {
    res.status(200).json({
        success: true,
        status: "ok",
        service: "GAP_WHATSAPP",
        uptime: process.uptime(),
        timestamp: new Date().toISOString(),
    });
});

app.use('/uploads', express.static(path.join(process.cwd(), 'uploads')));

app.use('/api/billing', billingRoutes);
app.use('/api/contacts', contactsRoutes);
app.use('/api/conversations', conversationsRoutes);
app.use('/api/agents', agentsRoutes);
app.use('/api', dashboardRoutes);
app.use('/api/flow-template-stars', flowTemplateStarsRoutes);
app.use('/api/flows', flowsRoutes);
app.use('/api/flow-sessions', flowSessionsRouter);
app.use('/api', messagesRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/team', teamRoutes);
app.use('/api/twilio', twilioRoutes);
app.use('/api', waRoutes);
app.use('/api/whatsapp', whatsappRoutes);
app.use('/api/integrations/google', googleAuthRoutes);
app.use('/api/appointments', appointmentsRoutes);
app.use(webhookRoutes); // Root level /webhook

export default app;
