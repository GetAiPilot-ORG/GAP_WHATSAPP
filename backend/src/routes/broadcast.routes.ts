import { Router } from 'express';
import multer from 'multer';
import { authMiddleware } from '../middlewares/auth.middleware.js';
import { 
    getBroadcastTags, 
    uploadHeaderMedia, 
    estimateBroadcast, 
    sendBroadcast, 
    getCampaigns, 
    deleteCampaign, 
    cancelCampaign,
    pauseCampaign,
    resumeCampaign,
    getCampaignRecipients,
    getBroadcastInsights,
} from '../controllers/broadcast.controller.js';

const router = Router();
const upload = multer({ storage: multer.memoryStorage() });

// Base: /api/broadcast
router.get('/tags', authMiddleware, getBroadcastTags);
router.post('/header-media', authMiddleware, upload.single('file'), uploadHeaderMedia);
router.post('/estimate', authMiddleware, estimateBroadcast);
router.post('/send', authMiddleware, sendBroadcast);

router.get('/campaigns', authMiddleware, getCampaigns);
router.delete('/campaigns/:id', authMiddleware, deleteCampaign);
router.post('/campaigns/:id/cancel', authMiddleware, cancelCampaign);
router.post('/campaigns/:id/pause', authMiddleware, pauseCampaign);
router.post('/campaigns/:id/resume', authMiddleware, resumeCampaign);
router.get('/campaigns/:id/recipients', authMiddleware, getCampaignRecipients);
router.get('/insights', authMiddleware, getBroadcastInsights);

export default router;
