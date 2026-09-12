import { addDays, parseISO } from 'date-fns';
import { format } from 'date-fns';
import { formatInTimeZone, fromZonedTime } from 'date-fns-tz';

export const dayKey = (d: Date, tz: string): string => formatInTimeZone(d, tz, 'yyyy-MM-dd');

/** [00:00, 24:00) in tz, converted to UTC instants. */
export function dayRange(key: string, tz: string): { start: Date; end: Date } {
  const start = fromZonedTime(`${key}T00:00:00`, tz);
  const nextKey = format(addDays(parseISO(key), 1), 'yyyy-MM-dd');
  const end = fromZonedTime(`${nextKey}T00:00:00`, tz);
  return { start, end };
}

export const localHour = (d: Date, tz: string): number => Number(formatInTimeZone(d, tz, 'H'));
