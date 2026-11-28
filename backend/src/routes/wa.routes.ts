import { Router } from 'express';
import { randomUUID } from 'node:crypto';
import { connectStart, connectCallback, logout } from '../controllers/wa.controller.js';
import { authMiddleware } from '../middlewares/auth.middleware.js';

const router = Router();

router.get('/wa/connect/start', connectStart);
router.post('/wa/connect/callback', (req, res, next) => {
    const requestId = randomUUID();
    const started = Date.now();
    res.setHeader('X-Connect-Request-Id', requestId);
    res.setHeader('X-Connect-Flow-Version', '2');
    console.info(`[Connect ${requestId}] Request received`);
    res.once('finish', () => {
        console.info(`[Connect ${requestId}] HTTP ${res.statusCode} after ${Date.now() - started}ms`);
    });
    void authMiddleware(req, res, () => {
        console.info(`[Connect ${requestId}] Authentication and subscription checks completed in ${Date.now() - started}ms`);
        next();
    });
}, connectCallback);
router.post('/wa/logout', logout);

export default router;
