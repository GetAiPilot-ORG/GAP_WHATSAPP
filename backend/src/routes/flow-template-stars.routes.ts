import { Router } from 'express';
import { authMiddleware } from '../middlewares/auth.middleware.js';

const router = Router();

router.get('/', authMiddleware, (_req, res) => {
    res.json({});
});

router.post('/:templateId', authMiddleware, (req, res) => {
    const templateId = String(req.params.templateId || '');
    res.json({
        template_id: templateId,
        disabled: true,
        stars: 0,
        starred: false,
    });
});

export default router;
