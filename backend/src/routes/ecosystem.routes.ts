import { Router } from 'express';
import { sendWhatsAppAction, getEcosystemTemplates } from '../controllers/ecosystem.controller.js';
import { planCheckMiddleware } from '../middlewares/plan.middleware.js';

const router = Router();

// Endpoint for bot-dashboard to trigger an automated WhatsApp fallback message
// Requires headers: { 'x-ecosystem-secret': process.env.ECOSYSTEM_SYNC_SECRET }
router.post('/ecosystem/trigger-whatsapp', planCheckMiddleware, sendWhatsAppAction);
router.get('/ecosystem/templates', getEcosystemTemplates);

export default router;
