/**
 * Parse an "HH:mm" string into hours and minutes.
 * Throws if the format is invalid.
 */

import { addDays, startOfDay } from 'date-fns';
import {
  formatInTimeZone,
  toDate,
  toZonedTime,
} from 'date-fns-tz';

export function parseHHmm(s: string): { hours: number; minutes: number } {
  const match = /^(\d{2}):(\d{2})$/.exec(s);
  if (!match) throw new Error(`Invalid HH:mm format: "${s}"`);

  const hours = parseInt(match[1], 10);
  const minutes = parseInt(match[2], 10);

  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) {
    throw new Error(`Out of range HH:mm: "${s}"`);
  }

  return { hours, minutes };
}

/**
 * Yield each calendar day in the doctor's timezone that overlaps [fromUtc, toUtc).
 * Returns dates at midnight in the doctor's local TZ (but represented as UTC Date objects).
 *
 * Example: fromUtc = 2026-06-08T00:00Z, toUtc = 2026-06-16T00:00Z, tz = 'Africa/Accra'
 * → yields 2026-06-08, 2026-06-09, ..., 2026-06-15 (8 days)
 */

export function iterateCalendarDays(
  fromUtc: Date,
  toUtc: Date,
  tz: string,
): Date[] {
  const days: Date[] = [];
  // Convert UTC bounds to the doctor's local TZ to find the first/last local day
  const localFrom = toZonedTime(fromUtc, tz);
  const localTo = toZonedTime(toUtc, tz);

  let current = startOfDay(localFrom);
  const last = startOfDay(localTo);

  while (current < last) {
    days.push(new Date(current));
    current = addDays(current, 1);
  }

  // Include the last day if toUtc doesn't land exactly on midnight local
  if (localTo > last && current.getTime() === last.getTime()) {
    // already included
  }

  return days;
}

/**
 * Given a calendar date (local midnight) and an "HH:mm" time in the doctor's
 * timezone, return the equivalent UTC Date.
 *
 * Example: calendarDate = 2026-06-08 (local), hhMm = "09:00", tz = "America/New_York"
 * → returns 2026-06-08T13:00:00Z (EDT = UTC-4 in June)
 */
export function localTimeToUtc(
  calendarDate: Date,
  hhMm: string,
  tz: string,
): Date {
  const { hours, minutes } = parseHHmm(hhMm);
  const z = toZonedTime(calendarDate, tz);
  const y = z.getFullYear();
  const mo = z.getMonth() + 1;
  const d = z.getDate();
  const pad = (n: number) => String(n).padStart(2, '0');
  const wall = `${y}-${pad(mo)}-${pad(d)}T${pad(hours)}:${pad(minutes)}:00`;
  return toDate(wall, { timeZone: tz });
}

/**
 * Return the weekday (0 = Sunday, 6 = Saturday) of a date in the given timezone.
 *
 * We use JS convention: 0 = Sunday. Document this in the API.
 */
export function getWeekday(calendarDate: Date, tz: string): number {
  const local = toZonedTime(calendarDate, tz);
  return local.getDay();
}

/**
 * Format a UTC instant as an ISO-8601 string with offset in `viewerTz`.
 */
export function utcInstantToZonedIso(instantUtc: Date, viewerTz: string): string {
  return formatInTimeZone(
    instantUtc,
    viewerTz,
    "yyyy-MM-dd'T'HH:mm:ss.SSSxxx",
  );
}
