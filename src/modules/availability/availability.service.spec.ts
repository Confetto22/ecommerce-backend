jest.mock('src/infrastructure/database/prisma.service', () => ({
  PrismaService: class PrismaService {},
}));

import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { AvailabilityKind } from 'generated/prisma/enums';
import { PrismaService } from 'src/infrastructure/database/prisma.service';
import { AvailabilityService } from './availability.service';

describe('AvailabilityService', () => {
  let service: AvailabilityService;
  let prisma: {
    doctorProfile: { findUnique: jest.Mock };
    doctorAvailability: { findMany: jest.Mock };
    appointment: { findMany: jest.Mock };
  };

  const doctorId = '11111111-1111-1111-1111-111111111111';

  beforeEach(async () => {
    prisma = {
      doctorProfile: { findUnique: jest.fn() },
      doctorAvailability: { findMany: jest.fn() },
      appointment: { findMany: jest.fn() },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AvailabilityService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = module.get(AvailabilityService);

    jest.useFakeTimers({ now: new Date('2026-06-01T12:00:00.000Z') });
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.clearAllMocks();
  });

  it('throws NotFoundException when profile missing', async () => {
    prisma.doctorProfile.findUnique.mockResolvedValue(null);
    await expect(
      service.getBookableSlots(
        doctorId,
        new Date('2026-06-08T00:00:00.000Z'),
        new Date('2026-06-16T00:00:00.000Z'),
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  /**
   * Walkthrough from docs: RECURRING Mon 09–11 & 13–15, OVERRIDE Mon 2026-06-08 10–12,
   * appt Mon 2026-06-15 09–10, slot length 60, TZ Africa/Accra.
   */
  it('getBookableSlots: recurring + override + appointment subtraction (integration)', async () => {
    prisma.doctorProfile.findUnique.mockResolvedValue({
      id: doctorId,
      appointmentSlotMinutes: 60,
      user: { timezone: 'Africa/Accra' },
    });

    prisma.doctorAvailability.findMany.mockResolvedValue([
      {
        kind: AvailabilityKind.RECURRING,
        weekday: 1,
        date: null,
        startTime: '09:00',
        endTime: '11:00',
        isActive: true,
      },
      {
        kind: AvailabilityKind.RECURRING,
        weekday: 1,
        date: null,
        startTime: '13:00',
        endTime: '15:00',
        isActive: true,
      },
      {
        kind: AvailabilityKind.OVERRIDE,
        weekday: null,
        date: new Date('2026-06-08T00:00:00.000Z'),
        startTime: '10:00',
        endTime: '12:00',
        isActive: true,
      },
    ]);

    prisma.appointment.findMany.mockResolvedValue([
      {
        scheduledStartAt: new Date('2026-06-15T09:00:00.000Z'),
        scheduledEndAt: new Date('2026-06-15T10:00:00.000Z'),
        status: 'PENDING',
      },
    ]);

    const from = new Date('2026-06-08T00:00:00.000Z');
    const to = new Date('2026-06-16T00:00:00.000Z');

    const result = await service.getBookableSlots(doctorId, from, to);

    expect(result.doctorId).toBe(doctorId);
    expect(result.doctorTimezone).toBe('Africa/Accra');
    expect(result.slotMinutes).toBe(60);
    expect(result.viewerTimezone).toBeUndefined();

    const iso = (d: Date) => d.toISOString();

    const jun8 = result.slots.filter(
      (s) => iso(s.startAt).slice(0, 10) === '2026-06-08',
    );
    expect(jun8.map((s) => `${iso(s.startAt)}/${iso(s.endAt)}`)).toEqual([
      '2026-06-08T10:00:00.000Z/2026-06-08T11:00:00.000Z',
      '2026-06-08T11:00:00.000Z/2026-06-08T12:00:00.000Z',
    ]);

    const jun15 = result.slots.filter(
      (s) => iso(s.startAt).slice(0, 10) === '2026-06-15',
    );
    expect(jun15.map((s) => `${iso(s.startAt)}/${iso(s.endAt)}`)).toEqual([
      '2026-06-15T10:00:00.000Z/2026-06-15T11:00:00.000Z',
      '2026-06-15T13:00:00.000Z/2026-06-15T14:00:00.000Z',
      '2026-06-15T14:00:00.000Z/2026-06-15T15:00:00.000Z',
    ]);
  });

  it('getBookableSlots: only isActive rules are loaded (mock simulates DB filter)', async () => {
    prisma.doctorProfile.findUnique.mockResolvedValue({
      id: doctorId,
      appointmentSlotMinutes: 60,
      user: { timezone: 'Africa/Accra' },
    });

    prisma.doctorAvailability.findMany.mockResolvedValue([
      {
        kind: AvailabilityKind.RECURRING,
        weekday: 1,
        date: null,
        startTime: '09:00',
        endTime: '12:00',
        isActive: true,
      },
    ]);

    prisma.appointment.findMany.mockResolvedValue([]);

    const from = new Date('2026-06-08T00:00:00.000Z');
    const to = new Date('2026-06-09T00:00:00.000Z');

    await service.getBookableSlots(doctorId, from, to);

    expect(prisma.doctorAvailability.findMany).toHaveBeenCalledWith({
      where: { doctorId, isActive: true },
    });
  });

  it('getBookableSlots: enriches slots when viewerTimezone is set', async () => {
    prisma.doctorProfile.findUnique.mockResolvedValue({
      id: doctorId,
      appointmentSlotMinutes: 60,
      user: { timezone: 'Africa/Accra' },
    });

    prisma.doctorAvailability.findMany.mockResolvedValue([
      {
        kind: AvailabilityKind.OVERRIDE,
        weekday: null,
        date: new Date('2026-06-08T00:00:00.000Z'),
        startTime: '10:00',
        endTime: '11:00',
        isActive: true,
      },
    ]);

    prisma.appointment.findMany.mockResolvedValue([]);

    const from = new Date('2026-06-08T00:00:00.000Z');
    const to = new Date('2026-06-09T00:00:00.000Z');

    const result = await service.getBookableSlots(
      doctorId,
      from,
      to,
      'Europe/London',
    );

    expect(result.viewerTimezone).toBe('Europe/London');
    expect(result.slots).toHaveLength(1);
    expect(result.slots[0].viewerLocalStartAt).toMatch(/\+01:00/);
    expect(result.slots[0].viewerLocalEndAt).toMatch(/\+01:00/);
  });

  it('getBookableSlots: returns empty slots when doctor has no rules', async () => {
    prisma.doctorProfile.findUnique.mockResolvedValue({
      id: doctorId,
      appointmentSlotMinutes: 30,
      user: { timezone: 'Africa/Accra' },
    });
    prisma.doctorAvailability.findMany.mockResolvedValue([]);
    prisma.appointment.findMany.mockResolvedValue([]);

    const result = await service.getBookableSlots(
      doctorId,
      new Date('2026-06-08T00:00:00.000Z'),
      new Date('2026-06-09T00:00:00.000Z'),
    );

    expect(result.slots).toEqual([]);
  });
});
