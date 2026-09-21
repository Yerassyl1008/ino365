import { Router, Request, Response } from 'express';
import { randomUUID } from 'crypto';
import { getDatabase, now, ensureDefaultHall } from '../db';
import { requireRole } from '../middleware/security';
import { ROLE_ACCESS } from '../../shared/role-permissions';

const router = Router();

const MAX_HALL_NAME = 80;

function trimName(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function hallRow(db: ReturnType<typeof getDatabase>, id: string) {
  return db.prepare(`
    SELECT h.*,
      (SELECT COUNT(*) FROM tables WHERE hall_id = h.id) AS table_count
    FROM halls h
    WHERE h.id = ?
  `).get(id);
}

function hallNameTaken(db: ReturnType<typeof getDatabase>, name: string, excludeId?: string): boolean {
  const rows = db.prepare('SELECT id, name FROM halls').all() as Array<{ id: string; name: string }>;
  const needle = name.toLocaleLowerCase();
  return rows.some((row) => row.name.toLocaleLowerCase() === needle && row.id !== excludeId);
}

function listHalls(db: ReturnType<typeof getDatabase>) {
  return db.prepare(`
    SELECT h.*,
      (SELECT COUNT(*) FROM tables WHERE hall_id = h.id) AS table_count
    FROM halls h
    ORDER BY h.is_default DESC, h.sort_order ASC, h.name ASC
  `).all();
}

router.get('/', (_req: Request, res: Response) => {
  try {
    const db = getDatabase();
    ensureDefaultHall(db);
    res.json({ halls: listHalls(db) });
  } catch (error: any) {
    console.error('[API] List halls failed:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/', requireRole(...ROLE_ACCESS.ownerManager), (req: Request, res: Response) => {
  try {
    const name = trimName(req.body?.name);
    if (!name) {
      return res.status(400).json({ error: 'Hall name is required', reason: 'hall_name_required' });
    }
    if (name.length > MAX_HALL_NAME) {
      return res.status(400).json({ error: 'Hall name is too long', reason: 'hall_name_too_long' });
    }

    const db = getDatabase();
    ensureDefaultHall(db);
    if (hallNameTaken(db, name)) {
      return res.status(400).json({ error: 'Hall name already exists', reason: 'hall_name_exists' });
    }

    const sortOrder = Number.isFinite(Number(req.body?.sort_order)) ? Number(req.body.sort_order) : 0;
    const id = `hall-${randomUUID().slice(0, 8)}`;
    db.prepare(`
      INSERT INTO halls (id, name, sort_order, is_default, created_at, updated_at)
      VALUES (?, ?, ?, 0, ?, ?)
    `).run(id, name, sortOrder, now(), now());

    res.status(201).json({ hall: hallRow(db, id) });
  } catch (error: any) {
    console.error('[API] Create hall failed:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.put('/:id', requireRole(...ROLE_ACCESS.ownerManager), (req: Request, res: Response) => {
  try {
    const db = getDatabase();
    const hall = db.prepare('SELECT * FROM halls WHERE id = ?').get(req.params.id) as any;
    if (!hall) {
      return res.status(404).json({ error: 'Hall not found', reason: 'hall_not_found' });
    }

    const fields: string[] = [];
    const params: unknown[] = [];

    if (req.body?.name !== undefined) {
      const name = trimName(req.body.name);
      if (!name) {
        return res.status(400).json({ error: 'Hall name is required', reason: 'hall_name_required' });
      }
      if (name.length > MAX_HALL_NAME) {
        return res.status(400).json({ error: 'Hall name is too long', reason: 'hall_name_too_long' });
      }
      if (hallNameTaken(db, name, req.params.id as string)) {
        return res.status(400).json({ error: 'Hall name already exists', reason: 'hall_name_exists' });
      }
      fields.push('name = ?');
      params.push(name);
    }

    if (req.body?.sort_order !== undefined) {
      const sortOrder = Number(req.body.sort_order);
      if (!Number.isFinite(sortOrder)) {
        return res.status(400).json({ error: 'sort_order must be a number' });
      }
      fields.push('sort_order = ?');
      params.push(sortOrder);
    }

    if (fields.length === 0) {
      return res.json({ hall: hallRow(db, req.params.id as string) });
    }

    fields.push('updated_at = ?');
    params.push(now(), req.params.id);
    db.prepare(`UPDATE halls SET ${fields.join(', ')} WHERE id = ?`).run(...params);

    res.json({ hall: hallRow(db, req.params.id as string) });
  } catch (error: any) {
    console.error('[API] Update hall failed:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.delete('/:id', requireRole(...ROLE_ACCESS.ownerManager), (req: Request, res: Response) => {
  try {
    const db = getDatabase();
    const hall = db.prepare('SELECT * FROM halls WHERE id = ?').get(req.params.id) as any;
    if (!hall) {
      return res.status(404).json({ error: 'Hall not found', reason: 'hall_not_found' });
    }

    const tableCount = (db.prepare('SELECT COUNT(*) AS n FROM tables WHERE hall_id = ?').get(req.params.id) as { n: number }).n;
    const reassignTo = typeof req.body?.reassign_to_hall_id === 'string' ? req.body.reassign_to_hall_id.trim() : '';

    if (tableCount > 0) {
      if (!reassignTo) {
        return res.status(409).json({
          error: 'Hall has tables. Reassign them before deleting.',
          reason: 'hall_not_empty',
          table_count: tableCount,
        });
      }
      if (reassignTo === req.params.id) {
        return res.status(400).json({ error: 'Cannot reassign tables to the same hall', reason: 'hall_reassign_self' });
      }
      const target = db.prepare('SELECT * FROM halls WHERE id = ?').get(reassignTo) as any;
      if (!target) {
        return res.status(400).json({ error: 'Target hall not found', reason: 'hall_not_found' });
      }
      const numberClash = db.prepare(`
        SELECT s.number FROM tables s
        JOIN tables d ON d.hall_id = ? AND d.number = s.number
        WHERE s.hall_id = ?
        LIMIT 1
      `).get(reassignTo, req.params.id) as { number: string } | undefined;
      if (numberClash) {
        return res.status(409).json({
          error: 'Target hall already has a table with the same number',
          reason: 'table_number_exists_in_target_hall',
          number: numberClash.number,
        });
      }
      const stamp = now();
      db.prepare('UPDATE tables SET hall_id = ?, updated_at = ? WHERE hall_id = ?')
        .run(reassignTo, stamp, req.params.id);
      if (hall.is_default) {
        db.prepare('UPDATE halls SET is_default = 1, updated_at = ? WHERE id = ?').run(stamp, reassignTo);
      }
    }

    db.prepare('DELETE FROM halls WHERE id = ?').run(req.params.id);
    ensureDefaultHall(db);
    res.json({ success: true });
  } catch (error: any) {
    if (String(error.message || '').includes('UNIQUE constraint')) {
      return res.status(409).json({
        error: 'Target hall already has a table with the same number',
        reason: 'table_number_exists_in_target_hall',
      });
    }
    console.error('[API] Delete hall failed:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export const hallRoutes = router;
