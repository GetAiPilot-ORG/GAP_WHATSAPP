import { createAgentCalendarAuthUrl } from '../controllers/agentCalendarAuth.controller.js';
import { listSessionCalendars, getUpcomingSessions, normalizeTimeZone } from '../services/agentCalendar.service.js';
import { Router } from 'express';
import {
  getAgents,
  createAgent,
  updateAgent,
  deleteAgent,
  syncAgentCalendar,
  testAgentChat,
} from '../controllers/agents.controller.js';
import { authMiddleware } from '../middlewares/auth.middleware.js';

const router = Router();

router.get('/calendar/auth-url', authMiddleware, createAgentCalendarAuthUrl);
router.get('/calendar/calendars', authMiddleware, async (req: any, res) => {
  try { res.json({ calendars: await listSessionCalendars(req.organization_id) }); }
  catch (error: any) { res.status(502).json({ error: error.message }); }
});
router.get('/calendar/preview', authMiddleware, async (req: any, res) => {
  try {
    const timezone = normalizeTimeZone(String(req.query.timezone || 'Asia/Kolkata'));
    res.json(
      await getUpcomingSessions(
        req.organization_id,
        String(req.query.calendar_id || ''),
        new Date().toISOString(),
        new Date(Date.now() + 14 * 86400000).toISOString(),
        timezone,
      ),
    );
  } catch (error: any) { res.status(502).json({ error: error.message }); }
});
router.get('/', authMiddleware, getAgents);
router.post('/', authMiddleware, createAgent);
router.patch('/:id', authMiddleware, updateAgent);
router.delete('/:id', authMiddleware, deleteAgent);
router.post('/:id/calendar/sync', authMiddleware, syncAgentCalendar);
router.post('/:id/test-chat', authMiddleware, testAgentChat);

export default router;
