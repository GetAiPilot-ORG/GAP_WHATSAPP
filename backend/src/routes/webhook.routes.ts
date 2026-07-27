import { Router } from 'express';
import { verifyWebhook, handleWebhook } from '../controllers/webhook.controller.js';

const router = Router();

router.get('/webhook', verifyWebhook);
router.post('/webhook', handleWebhook);

export default router;
