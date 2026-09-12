import type { DailyScore } from '@petplate/shared';
import { shiftDayKey } from '../../lib/day';

/**
 * Consecutive counted days ending at the most recent finalized day,
 * plus 1 if today already qualifies. Missing rows count as not counted.
 */
export function streakLength(rows: DailyScore[], todayKey: string): number {
  const byKey = new Map(rows.map((r) => [r.dayKey, r]));
  let n = 0;
  let key = todayKey;
  const today = byKey.get(todayKey);
  if (today?.streakCounted) {
    n = 1;
    key = shiftDayKey(todayKey, -1);
  } else {
    key = shiftDayKey(todayKey, -1);
  }
  while (true) {
    const row = byKey.get(key);
    if (!row?.streakCounted) break;
    n += 1;
    key = shiftDayKey(key, -1);
  }
  return n;
}
