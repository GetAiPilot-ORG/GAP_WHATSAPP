import { Router } from 'express';
import { 
    getConversations, 
    startConversation,
    assignConversation,
    updateConversationMeta,
    markUnread,
    clearConversation,
    deleteConversation
} from '../controllers/conversations.controller.js';
import { authMiddleware } from '../middlewares/auth.middleware.js';
import { updateConversationBot } from '../controllers/agents.controller.js';

const router = Router();

// Base path will be: /api/conversations

router.get('/', authMiddleware, getConversations);
router.post('/start', authMiddleware, startConversation);
router.patch('/:id/assign', authMiddleware, assignConversation);
router.patch('/:id/meta', authMiddleware, updateConversationMeta);
router.post('/:id/unread', authMiddleware, markUnread);
router.post('/:id/clear', authMiddleware, clearConversation);
router.delete('/:id', authMiddleware, deleteConversation);

// Note: Other message-specific routes (summary, messages, send, etc) 
// would be extracted to messages.routes.ts or here.

router.patch('/:id/bot', authMiddleware, updateConversationBot);

export default router;
