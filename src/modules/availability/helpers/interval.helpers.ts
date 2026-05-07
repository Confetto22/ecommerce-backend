import { addMinutes } from 'date-fns';
import { Interval, Slot } from '../types/availability.types';

/**
 * Subtract `remove` intervals from `base` intervals.
 * Both inputs should be sorted by `start` and non-overlapping within themselves.
 * Returns the remaining intervals, sorted.
 *
 * Example:
 *   base:   [09:00–17:00]
 *   remove: [12:00–13:00]
 *   result: [09:00–12:00, 13:00–17:00]
 */
export function subtractIntervals(
  base: Interval[],
  remove: Interval[],
): Interval[] {
  if (remove.length === 0) return [...base];
  if (base.length === 0) return [];

  const result: Interval[] = [];

  for (const b of base) {
    let remaining: Interval[] = [{ start: b.start, end: b.end }];

    for (const r of remove) {
      const next: Interval[] = [];
      for (const seg of remaining) {
        // No overlap
        if (r.end <= seg.start || r.start >= seg.end) {
          next.push(seg);
          continue;
        }
        // Left remainder
        if (r.start > seg.start) {
          next.push({ start: seg.start, end: r.start });
        }
        // Right remainder
        if (r.end < seg.end) {
          next.push({ start: r.end, end: seg.end });
        }
        // If r fully contains seg, nothing is pushed
      }
      remaining = next;
    }

    result.push(...remaining);
  }

  return result;
}

/**
 * Chop intervals into fixed-length slots.
 * Drops any remainder shorter than one full slot.
 *
 * Example: interval 09:00–10:30 with slotMinutes=60 → [09:00–10:00] (30 min remainder dropped)
 */
export function snapToSlotGrid(
  intervals: Interval[],
  slotMinutes: number,
): Slot[] {
  const slots: Slot[] = [];

  for (const interval of intervals) {
    let cursor = interval.start;

    while (true) {
      const slotEnd = addMinutes(cursor, slotMinutes);
      if (slotEnd > interval.end) break;

      slots.push({ startAt: cursor, endAt: slotEnd });
      cursor = slotEnd;
    }
  }

  return slots;
}

/**
 * Merge overlapping or adjacent intervals into contiguous blocks.
 * Input must be sorted by start.
 */
export function mergeIntervals(intervals: Interval[]): Interval[] {
  if (intervals.length <= 1) return [...intervals];

  const sorted = [...intervals].sort(
    (a, b) => a.start.getTime() - b.start.getTime(),
  );

  const merged: Interval[] = [sorted[0]];

  for (let i = 1; i < sorted.length; i++) {
    const last = merged[merged.length - 1];
    const curr = sorted[i];

    if (curr.start <= last.end) {
      // Overlapping or adjacent — extend
      last.end = curr.end > last.end ? curr.end : last.end;
    } else {
      merged.push(curr);
    }
  }

  return merged;
}
