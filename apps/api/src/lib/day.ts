import { addDays, parseISO, format } from 'date-fns';
import { formatInTimeZone, fromZonedTime } from 'date-fns-tz';

export const DEFAULT_TZ = 'America/New_York';

/** Day keys are YYYY-MM-DD in the user's timezone (AGENTS.md §4.6). */
export function dayKey(date: Date = new Date(), timezone: string = DEFAULT_TZ): string {
  return formatInTimeZone(date, timezone, 'yyyy-MM-dd');
}

/** Local hour in the user's timezone, used by the intraday mood pace logic. */
export function localHour(date: Date = new Date(), timezone: string = DEFAULT_TZ): number {
  return Number(formatInTimeZone(date, timezone, 'H'));
}

/** [00:00, 24:00) for a day key in the given timezone, as UTC instants. */
export function dayRange(key: string, tz: string): { start: Date; end: Date } {
  const start = fromZonedTime(`${key}T00:00:00.000`, tz);
  const next = format(addDays(parseISO(key), 1), 'yyyy-MM-dd');
  const end = fromZonedTime(`${next}T00:00:00.000`, tz);
  return { start, end };
}

export function shiftDayKey(key: string, days: number): string {
  return format(addDays(parseISO(key), days), 'yyyy-MM-dd');
}
