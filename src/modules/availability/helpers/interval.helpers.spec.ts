import { Interval } from '../types/availability.types';
import { snapToSlotGrid, subtractIntervals } from './interval.helpers';

const D = '2026-06-08';

/** Half-open [start, end) on a fixed calendar day in UTC for stable tests. */
function iv(hStart: number, mStart: number, hEnd: number, mEnd: number): Interval {
  const pad = (n: number) => String(n).padStart(2, '0');
  return {
    start: new Date(`${D}T${pad(hStart)}:${pad(mStart)}:00.000Z`),
    end: new Date(`${D}T${pad(hEnd)}:${pad(mEnd)}:00.000Z`),
  };
}

describe('interval.helpers', () => {
  describe('subtractIntervals', () => {
    it('returns base unchanged when remove is empty', () => {
      const base = [iv(9, 0, 17, 0)];
      expect(subtractIntervals(base, [])).toEqual(base);
    });

    it('returns empty when base is empty', () => {
      expect(subtractIntervals([], [iv(9, 0, 10, 0)])).toEqual([]);
    });

    it('no overlap: base unchanged', () => {
      const base = [iv(9, 0, 17, 0)];
      const remove = [iv(18, 0, 20, 0)];
      expect(subtractIntervals(base, remove)).toEqual(base);
    });

    it('full containment: nothing left', () => {
      const base = [iv(9, 0, 17, 0)];
      const remove = [iv(8, 0, 18, 0)];
      expect(subtractIntervals(base, remove)).toEqual([]);
    });

    it('left clip: remove overlaps start of base', () => {
      const base = [iv(9, 0, 17, 0)];
      const remove = [iv(8, 0, 12, 0)];
      expect(subtractIntervals(base, remove)).toEqual([iv(12, 0, 17, 0)]);
    });

    it('right clip: remove overlaps end of base', () => {
      const base = [iv(9, 0, 17, 0)];
      const remove = [iv(15, 0, 20, 0)];
      expect(subtractIntervals(base, remove)).toEqual([iv(9, 0, 15, 0)]);
    });

    it('middle punch', () => {
      const base = [iv(9, 0, 17, 0)];
      const remove = [iv(12, 0, 13, 0)];
      expect(subtractIntervals(base, remove)).toEqual([
        iv(9, 0, 12, 0),
        iv(13, 0, 17, 0),
      ]);
    });

    it('multiple remove intervals', () => {
      const base = [iv(9, 0, 17, 0)];
      const remove = [iv(10, 0, 11, 0), iv(14, 0, 15, 0)];
      expect(subtractIntervals(base, remove)).toEqual([
        iv(9, 0, 10, 0),
        iv(11, 0, 14, 0),
        iv(15, 0, 17, 0),
      ]);
    });
  });

  describe('snapToSlotGrid', () => {
    it('emits exact 60-minute slots for a 2-hour window', () => {
      const intervals = [iv(9, 0, 11, 0)];
      const slots = snapToSlotGrid(intervals, 60);
      expect(slots).toHaveLength(2);
      expect(slots[0].startAt.toISOString()).toBe('2026-06-08T09:00:00.000Z');
      expect(slots[0].endAt.toISOString()).toBe('2026-06-08T10:00:00.000Z');
      expect(slots[1].startAt.toISOString()).toBe('2026-06-08T10:00:00.000Z');
      expect(slots[1].endAt.toISOString()).toBe('2026-06-08T11:00:00.000Z');
    });

    it('drops remainder shorter than one slot', () => {
      const intervals = [iv(9, 0, 10, 30)];
      const slots = snapToSlotGrid(intervals, 60);
      expect(slots).toHaveLength(1);
    });

    it('returns no slots when interval shorter than slot length', () => {
      const intervals = [iv(9, 0, 9, 30)];
      expect(snapToSlotGrid(intervals, 60)).toEqual([]);
    });
  });
});
