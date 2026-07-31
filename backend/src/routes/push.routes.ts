import { Router } from 'express';
import { saveSubscription, removeSubscription } from '../services/push.service.js';
import { supabase } from '../config/supabase.js';

const router = Router();

// In a real production app, you'd use a middleware to extract the authenticated user.
// Since GAP uses Supabase auth, we'll assume the frontend sends the Authorization header.
const requireAuth = async (req: any, res: any, next: any) => {
    const authHeader = req.headers.authorization;
    if (!authHeader) {
        return res.status(401).json({ error: 'Missing authorization header' });
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error } = await supabase.auth.getUser(token);

    if (error || !user) {
        return res.status(401).json({ error: 'Invalid token' });
    }

    req.user = user;
    next();
};

/**
 * POST /api/push/subscribe
 * Body: { subscription, orgId }
 */
router.post('/subscribe', requireAuth, async (req: any, res: any) => {
    try {
        const { subscription, orgId } = req.body;
        const userId = req.user.id;

        if (!subscription || !subscription.endpoint || !orgId) {
            return res.status(400).json({ error: 'Missing subscription details or orgId' });
        }

        await saveSubscription(userId, orgId, subscription);
        res.status(200).json({ success: true, message: 'Subscription saved' });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

/**
 * DELETE /api/push/unsubscribe
 * Body: { endpoint }
 */
router.delete('/unsubscribe', requireAuth, async (req: any, res: any) => {
    try {
        const { endpoint } = req.body;
        const userId = req.user.id;

        if (!endpoint) {
            return res.status(400).json({ error: 'Missing endpoint' });
        }

        await removeSubscription(userId, endpoint);
        res.status(200).json({ success: true, message: 'Subscription removed' });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

/**
 * GET /api/push/vapid-public-key
 * Allows the frontend to request the public key if not hardcoded
 */
router.get('/vapid-public-key', (req: any, res: any) => {
    res.status(200).json({ publicKey: process.env.VAPID_PUBLIC_KEY });
});

export default router;
