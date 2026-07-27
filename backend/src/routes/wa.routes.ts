import { Router } from 'express';
import { connectStart, connectCallback, logout } from '../controllers/wa.controller.js';
import { authMiddleware } from '../middlewares/auth.middleware.js';

const router = Router();

router.get('/wa/connect/start', connectStart);
router.post('/wa/connect/callback', authMiddleware, connectCallback);
router.post('/wa/logout', logout);

export default router;
