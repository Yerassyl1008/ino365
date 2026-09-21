/** Display name for a table when the same number can exist in more than one hall. */
export function tableDisplayName(
  number: string | number | null | undefined,
  hallName?: string | null,
  qualifyWithHall = true,
): string {
  const n = String(number ?? '').trim();
  const h = String(hallName ?? '').trim();
  if (qualifyWithHall && h && n) return `${h} · ${n}`;
  return n || h;
}

/** True when floor/order lists span more than one hall — then prefix the hall. */
export function tableNeedsHallPrefix(items: Array<{ hall_id?: string | null }>): boolean {
  const halls = new Set(items.map((item) => item.hall_id).filter(Boolean));
  return halls.size > 1;
}
