import { toZonedTime } from 'date-fns-tz';
import {
  getWeekday,
  iterateCalendarDays,
  localTimeToUtc,
  parseHHmm,
  utcInstantToZonedIso,
} from './time.helpers';

describe('time.helpers', () => {
  describe('parseHHmm', () => {
    it('parses valid HH:mm', () => {
      expect(parseHHmm('09:00')).toEqual({ hours: 9, minutes: 0 });
      expect(parseHHmm('00:59')).toEqual({ hours: 0, minutes: 59 });
    });

    it('rejects non-two-digit hour or minute', () => {
      expect(() => parseHHmm('9:00')).toThrow(/Invalid HH:mm/);
      expect(() => parseHHmm('09:0')).toThrow(/Invalid HH:mm/);
      expect(() => parseHHmm('09-00')).toThrow(/Invalid HH:mm/);
    });

    it('rejects out-of-range values', () => {
      expect(() => parseHHmm('25:00')).toThrow(/Out of range/);
      expect(() => parseHHmm('09:60')).toThrow(/Out of range/);
    });
  });

  describe('localTimeToUtc', () => {
    /**
     * A `day` value like `iterateCalendarDays` yields for a given **local** Y-M-D in `tz`
     * (stable across host process TZ — matches how the solver feeds `localTimeToUtc`).
     */
    function calendarDayInTz(ymd: string, tz: string): Date {
      const [y, m, d] = ymd.split('-').map(Number);
      const fromUtc = new Date(Date.UTC(y, m - 1, d - 1, 12, 0, 0));
      const toUtc = new Date(Date.UTC(y, m - 1, d + 2, 12, 0, 0));
      const days = iterateCalendarDays(fromUtc, toUtc, tz);
      for (const day of days) {
        const local = toZonedTime(day, tz);
        if (
          local.getFullYear() === y &&
          local.getMonth() === m - 1 &&
          local.getDate() === d
        ) {
          return day;
        }
      }
      throw new Error(`no iterate day for ${ymd} in ${tz}`);
    }

    it('maps wall time in Africa/Accra to the same UTC clock (UTC+0)', () => {
      const day = calendarDayInTz('2026-06-08', 'Africa/Accra');
      const utc = localTimeToUtc(day, '09:00', 'Africa/Accra');
      expect(utc.toISOString()).toBe('2026-06-08T09:00:00.000Z');
    });

    it('maps America/New_York summer (EDT)', () => {
      const day = calendarDayInTz('2026-06-08', 'America/New_York');
      const utc = localTimeToUtc(day, '09:00', 'America/New_York');
      expect(utc.toISOString()).toBe('2026-06-08T13:00:00.000Z');
    });

    it('maps America/New_York winter (EST)', () => {
      const day = calendarDayInTz('2026-12-08', 'America/New_York');
      const utc = localTimeToUtc(day, '09:00', 'America/New_York');
      expect(utc.toISOString()).toBe('2026-12-08T14:00:00.000Z');
    });
  });

  describe('getWeekday', () => {
    it('returns Monday (1) for 2026-06-08 in Africa/Accra', () => {
      const day = new Date('2026-06-08T00:00:00.000Z');
      expect(getWeekday(day, 'Africa/Accra')).toBe(1);
    });
  });

  describe('iterateCalendarDays', () => {
    it('returns 8 local calendar days for 2026-06-08Z–2026-06-16Z in Accra', () => {
      const fromUtc = new Date('2026-06-08T00:00:00.000Z');
      const toUtc = new Date('2026-06-16T00:00:00.000Z');
      const days = iterateCalendarDays(fromUtc, toUtc, 'Africa/Accra');
      expect(days).toHaveLength(8);
      expect(days[0].toISOString().slice(0, 10)).toBe('2026-06-08');
      expect(days[7].toISOString().slice(0, 10)).toBe('2026-06-15');
    });
  });

  describe('utcInstantToZonedIso', () => {
    it('includes +01:00 offset for Europe/London in June (BST)', () => {
      const instant = new Date('2026-06-09T09:00:00.000Z');
      const s = utcInstantToZonedIso(instant, 'Europe/London');
      expect(s).toMatch(/\+01:00$/);
      expect(s).toContain('T10:00:00');
    });
  });
});
