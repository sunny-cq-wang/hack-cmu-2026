import { addDays, parseISO, format } from 'date-fns';
import { formatInTimeZone, fromZonedTime } from 'date-fns-tz';

// TODO(P2): replace — exact signature:
//   dayKey(d: Date, tz: string) => 'YYYY-MM-DD'
//   dayRange(key: string, tz: string): { start: Date; end: Date }  // [00:00, 24:00) in tz, UTC
//   localHour(d: Date, tz: string) => Number(formatInTimeZone(d, tz, 'H'))

export const dayKey = (d: Date, tz: string): string => formatInTimeZone(d, tz, 'yyyy-MM-dd');

export function dayRange(key: string, tz: string): { start: Date; end: Date } {
  const start = fromZonedTime(`${key}T00:00:00.000`, tz);
  const next = format(addDays(parseISO(key), 1), 'yyyy-MM-dd');
  const end = fromZonedTime(`${next}T00:00:00.000`, tz);
  return { start, end };
}

export const localHour = (d: Date, tz: string): number => Number(formatInTimeZone(d, tz, 'H'));

export function shiftDayKey(key: string, days: number): string {
  return format(addDays(parseISO(key), days), 'yyyy-MM-dd');
}
