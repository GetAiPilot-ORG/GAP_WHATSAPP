import { createAgentCalendarAuthUrl } from '../controllers/agentCalendarAuth.controller.js';
import { listSessionCalendars, getUpcomingSessions } from '../services/agentCalendar.service.js';
import { Router } from 'express';
import { getAgents, createAgent, updateAgent, deleteAgent } from '../controllers/agents.controller.js';
import { authMiddleware } from '../middlewares/auth.middleware.js';

const router = Router();

router.get('/calendar/auth-url', authMiddleware, createAgentCalendarAuthUrl);
router.get('/calendar/calendars', authMiddleware, async (req: any, res) => {
  try { res.json({ calendars: await listSessionCalendars(req.organization_id) }); }
  catch (error: any) { res.status(502).json({ error: error.message }); }
});
router.get('/calendar/preview', authMiddleware, async (req: any, res) => {
  try {
    res.json(await getUpcomingSessions(req.organization_id, String(req.query.calendar_id || ''), new Date().toISOString(), new Date(Date.now() + 14 * 86400000).toISOString()));
  } catch (error: any) { res.status(502).json({ error: error.message }); }
});
router.get('/',  authMiddleware, getAgents);
router.post('/', authMiddleware, createAgent);
router.patch('/:id', authMiddleware, updateAgent);
router.delete('/:id', authMiddleware, deleteAgent);

export default router;
