import { Router } from 'express';
import { getDashboardStats } from '../controllers/dashboard.controller.js';
import { authMiddleware } from '../middlewares/auth.middleware.js';

const router = Router();

router.get('/dashboard-stats', authMiddleware, getDashboardStats);

export default router;
