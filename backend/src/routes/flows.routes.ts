import { Router } from 'express';
import { 
    getFlows,
    getFlowById,
    createFlow,
    updateFlow,
    validateFlow,
    publishFlow,
    getFlowRuns,
    getFlowRunById,
    deleteFlow,
    getFlowSessionByContact,
    deleteFlowSession
} from '../controllers/flows.controller.js';
import { authMiddleware } from '../middlewares/auth.middleware.js';

const router = Router();

// Flows
router.get('/', authMiddleware, getFlows);
router.post('/', authMiddleware, createFlow);
router.get('/:id', authMiddleware, getFlowById);
router.put('/:id', authMiddleware, updateFlow);
router.delete('/:id', authMiddleware, deleteFlow);

router.post('/:id/validate', authMiddleware, validateFlow);
router.post('/:id/publish', authMiddleware, publishFlow);

router.get('/:id/runs', authMiddleware, getFlowRuns);

export default router;

export const flowRunsRouter = Router();
flowRunsRouter.get('/:id', authMiddleware, getFlowRunById);

export const flowSessionsRouter = Router();
flowSessionsRouter.get('/:contact_id', authMiddleware, getFlowSessionByContact);
flowSessionsRouter.delete('/:id', authMiddleware, deleteFlowSession);
