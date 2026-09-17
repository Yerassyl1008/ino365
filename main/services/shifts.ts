import { v4 as uuidv4 } from 'uuid';
import { getDatabase, now } from '../db';

type Database = ReturnType<typeof getDatabase>;

export type ShiftRow = {
  id: string;
  user_id: string;
  opened_at: string;
  closed_at: string | null;
};

export function getOpenShift(db: Database, userId: string): ShiftRow | undefined {
  return db.prepare(
    'SELECT * FROM shifts WHERE user_id = ? AND closed_at IS NULL ORDER BY opened_at DESC LIMIT 1',
  ).get(userId) as ShiftRow | undefined;
}

export function ensureOpenShift(db: Database, userId: string): ShiftRow {
  const existing = getOpenShift(db, userId);
  if (existing) return existing;
  const shift: ShiftRow = {
    id: uuidv4(),
    user_id: userId,
    opened_at: now(),
    closed_at: null,
  };
  db.prepare('INSERT INTO shifts (id, user_id, opened_at) VALUES (?, ?, ?)')
    .run(shift.id, shift.user_id, shift.opened_at);
  return shift;
}

export function closeOpenShift(db: Database, userId: string): ShiftRow | undefined {
  const existing = getOpenShift(db, userId);
  if (!existing) return undefined;
  const closedAt = now();
  db.prepare('UPDATE shifts SET closed_at = ? WHERE id = ?').run(closedAt, existing.id);
  return { ...existing, closed_at: closedAt };
}
