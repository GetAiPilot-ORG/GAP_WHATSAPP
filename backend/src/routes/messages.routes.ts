import { Router } from 'express';
import { getMessages, getConversationSummary, requestSummary, postSummary, addReaction, deleteMessage, sendMessage, markAsRead } from '../controllers/messages.controller.js';
import { authMiddleware } from '../middlewares/auth.middleware.js';

const router = Router();

router.get('/messages/:conversationId', authMiddleware, getMessages);
router.post('/messages/:messageId/reaction', authMiddleware, addReaction);
router.delete('/messages/:messageId', authMiddleware, deleteMessage);

router.get('/conversations/:id/messages', authMiddleware, getMessages); // Alias for required route shape
router.get('/conversations/:id/summary', authMiddleware, getConversationSummary);
router.post('/conversations/:id/request-summary', authMiddleware, requestSummary);
router.post('/n8n/conversations/:conversationId/summary', postSummary); // Webhook endpoint, using n8n secret check

router.post('/conversations/:conversationId/send', authMiddleware, sendMessage);
router.post('/conversations/:id/read', authMiddleware, markAsRead);

export default router;
