import { Router, Request, Response } from 'express';
import { getDatabase } from '../db';
import { requireRole } from '../middleware/security';
import { ROLE_ACCESS } from '../../shared/role-permissions';
import { closeOpenShift, ensureOpenShift, getOpenShift } from '../services/shifts';

const router = Router();

router.get('/current', requireRole(...ROLE_ACCESS.sales), (req: Request, res: Response) => {
  try {
    const userId = String((req as any).user.userId);
    const db = getDatabase();
    const shift = getOpenShift(db, userId) || null;
    res.json({ shift });
  } catch (error: any) {
    console.error('[API] Internal error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/open', requireRole(...ROLE_ACCESS.sales), (req: Request, res: Response) => {
  try {
    const userId = String((req as any).user.userId);
    const db = getDatabase();
    const shift = ensureOpenShift(db, userId);
    res.json({ shift });
  } catch (error: any) {
    console.error('[API] Internal error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/close', requireRole(...ROLE_ACCESS.sales), (req: Request, res: Response) => {
  try {
    const userId = String((req as any).user.userId);
    const db = getDatabase();
    const shift = closeOpenShift(db, userId);
    if (!shift) {
      return res.status(400).json({ error: 'No open shift' });
    }
    res.json({ shift });
  } catch (error: any) {
    console.error('[API] Internal error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export const shiftRoutes = router;
