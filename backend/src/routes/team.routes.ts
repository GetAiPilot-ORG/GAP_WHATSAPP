import { Router } from 'express';
import {
    getMembers,
    inviteMember,
    acceptInvite,
    resendInvite,
    updateMember,
    deleteMember,
    getMyProfile,
    updateMyProfile,
    updateMyStatus,
    getAgents,
    updateMyOnlineStatus
} from '../controllers/team.controller.js';
import { authMiddleware } from '../middlewares/auth.middleware.js';

const router = Router();

// Base path will be: /api/team

router.get('/members', authMiddleware, getMembers);
router.post('/invite', authMiddleware, inviteMember);
router.post('/invite/accept', acceptInvite); // No auth middleware here as user isn't logged in yet
router.post('/members/:id/resend-invite', authMiddleware, resendInvite);
router.patch('/members/:id', authMiddleware, updateMember);
router.delete('/members/:id', authMiddleware, deleteMember);

router.get('/my-profile', authMiddleware, getMyProfile);
router.patch('/my-profile', authMiddleware, updateMyProfile);
router.patch('/status', authMiddleware, updateMyOnlineStatus);

router.get('/agents', authMiddleware, getAgents);

export default router;
