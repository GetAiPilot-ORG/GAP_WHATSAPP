import { Router } from 'express';
import { searchAvailableNumbers, buyNumber } from '../controllers/twilio.controller.js';
import { authMiddleware } from '../middlewares/auth.middleware.js';

const router = Router();

// Base path will be: /api/twilio

router.post('/available-numbers', authMiddleware, searchAvailableNumbers);
router.post('/buy-number', authMiddleware, buyNumber);

export default router;
