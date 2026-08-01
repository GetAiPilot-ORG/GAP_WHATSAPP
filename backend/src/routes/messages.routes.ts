import { Router } from 'express';
import multer from 'multer';
import { getMessages, getConversationSummary, requestSummary, postSummary, addReaction, deleteMessage, sendMessage, markAsRead, sendMediaMessage } from '../controllers/messages.controller.js';
import { authMiddleware } from '../middlewares/auth.middleware.js';

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 100 * 1024 * 1024 } });

router.get('/messages/:conversationId', authMiddleware, getMessages);
router.post('/messages/:messageId/reaction', authMiddleware, addReaction);
router.delete('/messages/:messageId', authMiddleware, deleteMessage);

router.get('/conversations/:id/messages', authMiddleware, getMessages); // Alias for required route shape
router.get('/conversations/:id/summary', authMiddleware, getConversationSummary);
router.post('/conversations/:id/request-summary', authMiddleware, requestSummary);
router.post('/n8n/conversations/:conversationId/summary', postSummary); // Webhook endpoint, using n8n secret check

router.post('/conversations/:conversationId/send', authMiddleware, sendMessage);
router.post('/conversations/:conversationId/send-media', authMiddleware, upload.single('file'), sendMediaMessage);
router.post('/conversations/:id/read', authMiddleware, markAsRead);

export default router;
