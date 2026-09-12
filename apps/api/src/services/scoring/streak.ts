/** TODO(P3): replace with full ALGORITHMS §3.4 spec. */
import { addDays, format, parseISO } from 'date-fns';
import type { DailyScore } from '@petplate/shared';

export function streakLength(rows: DailyScore[], todayKey: string): number {
  const byKey = new Map(rows.map((row) => [row.dayKey, row]));
  let length = 0;
  let cursor = addDays(parseISO(todayKey), -1);
  for (;;) {
    const key = format(cursor, 'yyyy-MM-dd');
    const row = byKey.get(key);
    if (!row?.streakCounted) break;
    length += 1;
    cursor = addDays(cursor, -1);
  }
  if (byKey.get(todayKey)?.streakCounted) length += 1;
  return length;
}
