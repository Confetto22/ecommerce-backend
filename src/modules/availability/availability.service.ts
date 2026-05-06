import { Injectable, NotFoundException } from '@nestjs/common';
import { AvailabilityKind } from 'generated/prisma/enums';
import { PrismaService } from 'src/infrastructure/database/prisma.service';
import {
  getWeekday,
  iterateCalendarDays,
  localTimeToUtc,
  utcInstantToZonedIso,
} from './helpers/time.helpers';
import { Interval, EnrichedSlot, SlotResult } from './types/availability.types';
import { snapToSlotGrid, subtractIntervals } from './helpers/interval.helpers';

@Injectable()
export class AvailabilityService {
  constructor(private readonly db: PrismaService) {}

  async getBookableSlots(
    doctorId: string,
    from: Date,
    to: Date,
    viewerTimezone?: string,
  ): Promise<SlotResult> {
    // ─── Step 1: Load everything from DB ───────────────────────
    const [profile, rules, appointments] = await Promise.all([
      this.db.doctorProfile.findUnique({
        where: { id: doctorId },
        include: { user: { select: { timezone: true } } },
      }),
      this.db.doctorAvailability.findMany({
        where: { doctorId, isActive: true },
      }),
      this.db.appointment.findMany({
        where: {
          doctorId,
          status: { in: ['PENDING', 'APPROVED'] },
          scheduledStartAt: { lt: to },
          scheduledEndAt: { gt: from },
        },
      }),
    ]);

    if (!profile) {
      throw new NotFoundException('Doctor not found');
    }
    const tz = profile.user.timezone;
    const slotMinutes = profile.appointmentSlotMinutes;

    // Separate rules by kind
    const recurring = rules.filter(
      (r) => r.kind === AvailabilityKind.RECURRING,
    );
    const overrides = rules.filter((r) => r.kind === AvailabilityKind.OVERRIDE);
    const blackouts = rules.filter((r) => r.kind === AvailabilityKind.BLACKOUT);

    // ─── Step 2: Expand RECURRING into UTC intervals ───────────
    const days = iterateCalendarDays(from, to, tz);
    let openIntervals: Interval[] = [];

    // Build a set of dates that have overrides (for step 3)
    const overrideDates = new Set(
      overrides.map((o) => o.date!.toISOString().slice(0, 10)),
    );

    for (const day of days) {
      const dayStr = day.toISOString().slice(0, 10);
      const weekday = getWeekday(day, tz);

      // ─── Step 3: If this day has OVERRIDE rows, use those instead ──
      if (overrideDates.has(dayStr)) {
        const dayOverrides = overrides.filter(
          (o) => o.date!.toISOString().slice(0, 10) === dayStr,
        );
        for (const o of dayOverrides) {
          openIntervals.push({
            start: localTimeToUtc(day, o.startTime, tz),
            end: localTimeToUtc(day, o.endTime, tz),
          });
        }
      } else {
        // Use RECURRING rules for this weekday
        const dayRules = recurring.filter((r) => r.weekday === weekday);
        for (const rule of dayRules) {
          openIntervals.push({
            start: localTimeToUtc(day, rule.startTime, tz),
            end: localTimeToUtc(day, rule.endTime, tz),
          });
        }
      }
    }

    // ─── Step 4: Subtract BLACKOUT ranges ──────────────────────
    const blackoutIntervals: Interval[] = blackouts
      .filter((b) => {
        const bDate = b.date!.toISOString().slice(0, 10);
        return days.some((d) => d.toISOString().slice(0, 10) === bDate);
      })
      .map((b) => {
        const bDay = days.find(
          (d) =>
            d.toISOString().slice(0, 10) === b.date!.toISOString().slice(0, 10),
        )!;
        // Full-day block if startTime/endTime are "00:00"/"23:59" or similar
        return {
          start: localTimeToUtc(bDay, b.startTime, tz),
          end: localTimeToUtc(bDay, b.endTime, tz),
        };
      });

    openIntervals = subtractIntervals(openIntervals, blackoutIntervals);

    // ─── Step 5: Subtract existing appointments ────────────────
    const appointmentIntervals: Interval[] = appointments.map((a) => ({
      start: a.scheduledStartAt,
      end: a.scheduledEndAt,
    }));

    openIntervals = subtractIntervals(openIntervals, appointmentIntervals);

    // ─── Step 6: Snap to slot grid ─────────────────────────────
    // Filter out past slots
    const now = new Date();
    openIntervals = openIntervals.filter((i) => i.end > now);
    // Clip intervals that start in the past
    openIntervals = openIntervals.map((i) => ({
      start: i.start < now ? now : i.start,
      end: i.end,
    }));

    let slots: EnrichedSlot[] = snapToSlotGrid(openIntervals, slotMinutes);

    if (viewerTimezone) {
      slots = slots.map((s) => ({
        ...s,
        viewerLocalStartAt: utcInstantToZonedIso(s.startAt, viewerTimezone),
        viewerLocalEndAt: utcInstantToZonedIso(s.endAt, viewerTimezone),
      }));
    }

    // ─── Step 7: Return ────────────────────────────────────────
    return {
      doctorId,
      doctorTimezone: tz,
      ...(viewerTimezone ? { viewerTimezone } : {}),
      slotMinutes,
      slots,
    };
  }
}
