import { describe, expect, it } from 'vitest';
import { dayKey, dayRange, localHour } from '../src/lib/day';

describe('dayKey / dayRange / localHour', () => {
  it('splits Vancouver vs Tokyo around UTC midnight', () => {
    const stillYesterdayInVancouver = new Date('2026-09-12T06:30:00Z');
    expect(dayKey(stillYesterdayInVancouver, 'America/Vancouver')).toBe('2026-09-11');
    expect(dayKey(stillYesterdayInVancouver, 'Asia/Tokyo')).toBe('2026-09-12');
    expect(localHour(stillYesterdayInVancouver, 'America/Vancouver')).toBe(23);
    expect(localHour(stillYesterdayInVancouver, 'Asia/Tokyo')).toBe(15);

    const afterVancouverMidnight = new Date('2026-09-12T07:30:00Z');
    expect(dayKey(afterVancouverMidnight, 'America/Vancouver')).toBe('2026-09-12');
    expect(dayKey(afterVancouverMidnight, 'Asia/Tokyo')).toBe('2026-09-12');
  });

  it('returns a half-open UTC range for America/Vancouver', () => {
    const { start, end } = dayRange('2026-09-12', 'America/Vancouver');
    expect(start.toISOString()).toBe('2026-09-12T07:00:00.000Z');
    expect(end.toISOString()).toBe('2026-09-13T07:00:00.000Z');
  });

  it('returns a half-open UTC range for Asia/Tokyo', () => {
    const { start, end } = dayRange('2026-09-12', 'Asia/Tokyo');
    expect(start.toISOString()).toBe('2026-09-11T15:00:00.000Z');
    expect(end.toISOString()).toBe('2026-09-12T15:00:00.000Z');
  });
});
