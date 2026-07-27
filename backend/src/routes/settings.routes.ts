import { Router } from 'express';
import multer from 'multer';
import { 
    getKnowledgeBase, 
    uploadKnowledgeBase, 
    deleteKnowledgeBase,
    getOpenAISettings,
    saveOpenAISettings,
    getAutoAssignSettings,
    saveAutoAssignSettings
} from '../controllers/settings.controller.js';
import { authMiddleware } from '../middlewares/auth.middleware.js';

const router = Router();
const upload = multer({ storage: multer.memoryStorage() });

// Base path will be: /api/settings

router.get('/knowledge-base', authMiddleware, getKnowledgeBase);
router.post('/knowledge-base', authMiddleware, upload.single('file'), uploadKnowledgeBase);
router.delete('/knowledge-base/:id', authMiddleware, deleteKnowledgeBase);

router.get('/openai', authMiddleware, getOpenAISettings);
router.post('/openai', authMiddleware, saveOpenAISettings);

router.get('/auto-assign', authMiddleware, getAutoAssignSettings);
router.post('/auto-assign', authMiddleware, saveAutoAssignSettings);

export default router;
