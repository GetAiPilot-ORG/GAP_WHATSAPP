import { Router } from 'express';
import { getAgents, createAgent, updateAgent, deleteAgent } from '../controllers/agents.controller.js';
import { authMiddleware } from '../middlewares/auth.middleware.js';

const router = Router();

router.get('/', authMiddleware, getAgents);
router.post('/', authMiddleware, createAgent);
router.patch('/:id', authMiddleware, updateAgent);
router.delete('/:id', authMiddleware, deleteAgent);

export default router;
