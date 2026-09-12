import { formatInTimeZone } from 'date-fns-tz';

export const DEFAULT_TZ = 'America/New_York';

/** Day keys are YYYY-MM-DD in the user's timezone (AGENTS.md §4.6). */
export function dayKey(date: Date = new Date(), timezone: string = DEFAULT_TZ): string {
  return formatInTimeZone(date, timezone, 'yyyy-MM-dd');
}

/** Local hour in the user's timezone, used by the intraday mood pace logic. */
export function localHour(date: Date = new Date(), timezone: string = DEFAULT_TZ): number {
  return Number(formatInTimeZone(date, timezone, 'H'));
}
