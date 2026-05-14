import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import {
  Appointment,
  AppointmentType,
  Prisma,
} from 'generated/prisma/client';
import { PrismaService } from 'src/infrastructure/database/prisma.service';
import { AvailabilityService } from '../availability/availability.service';
import { User } from '../user/entities/user.entity';
import { CreateAppointmentDto } from './dto/create-appointment.dto';
import { AppointmentResponseDto } from './dto/appointment-response.dto';
import { APPOINTMENT_CREATED } from './events/appointment.events';

// ──────────────────────────────────────────────────────────────────────────────
// Error detection helpers (§4.3, §3.2)
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Detects the Postgres exclusion-constraint violation (`23P01`) or the
 * unique-constraint violation on `(doctorId, scheduledStartAt)`.
 *
 * Prisma's mapping of obscure SQL errors evolves across versions, so we
 * use a multi-branch detection strategy that is deliberately defensive.
 */
function isOverlapViolation(e: unknown): boolean {
  if (!(e instanceof Prisma.PrismaClientKnownRequestError)) return false;

  // Branch 1: Prisma surfaces it as P2002 targeting the exclusion constraint name
  if (
    e.code === 'P2002' &&
    (e.meta?.target as string[] | undefined)?.includes(
      'Appointment_no_overlap_per_doctor',
    )
  ) {
    return true;
  }

  // Branch 2: P2002 on the cheaper unique index (doctorId, scheduledStartAt)
  if (e.code === 'P2002') {
    const target = e.meta?.target as string[] | undefined;
    if (
      target &&
      target.includes('doctorId') &&
      target.includes('scheduledStartAt')
    ) {
      return true;
    }
  }

  // Branch 3: constraint name appears in the error message
  if (e.message.includes('Appointment_no_overlap_per_doctor')) return true;

  // Branch 4: raw SQLSTATE
  if (e.message.includes('exclusion_violation')) return true;
  if ((e as { code?: string }).code === '23P01') return true;

  return false;
}

/**
 * Detects a unique-constraint violation on a specific field.
 */
function isUniqueViolation(e: unknown, field: string): boolean {
  if (!(e instanceof Prisma.PrismaClientKnownRequestError)) return false;
  if (e.code !== 'P2002') return false;
  const target = e.meta?.target as string[] | undefined;
  return !!target && target.includes(field);
}

// ──────────────────────────────────────────────────────────────────────────────
// Internal context type for the insert step
// ──────────────────────────────────────────────────────────────────────────────

interface BookingContext {
  patient: { id: string; user: User };
  doctor: {
    id: string;
    appointmentSlotMinutes: number;
    modeOfConsultation: string;
    perHourRate: number;
    published: boolean;
    user: { timezone: string };
  };
  start: Date;
  end: Date;
}

// ──────────────────────────────────────────────────────────────────────────────
// Service
// ──────────────────────────────────────────────────────────────────────────────

@Injectable()
export class BookingService {
  static readonly MAX_HORIZON_DAYS = 90;
  private readonly logger = new Logger(BookingService.name);

  constructor(
    private readonly db: PrismaService,
    private readonly availability: AvailabilityService,
    private readonly events: EventEmitter2,
  ) {}

  // ──────────────────────────────────────────────────────────────────────────
  // Public API
  // ──────────────────────────────────────────────────────────────────────────

  async create(
    patientUser: User,
    dto: CreateAppointmentDto,
  ): Promise<AppointmentResponseDto> {
    // ── 1. Idempotency hit? ────────────────────────────────────────────────
    const existing = await this.db.appointment.findUnique({
      where: { idempotencyKey: dto.idempotencyKey },
    });
    if (existing) {
      return AppointmentResponseDto.from(existing);
    }

    // ── 2. Load patient profile (must exist) ──────────────────────────────
    const patientProfile = await this.db.patientProfile.findUnique({
      where: { userId: patientUser.id },
    });
    if (!patientProfile) {
      throw new ForbiddenException({
        error: 'PROFILE_REQUIRED',
        message: 'Complete your patient profile first',
      });
    }

    // ── 3. Load & validate doctor ─────────────────────────────────────────
    const doctor = await this.db.doctorProfile.findUnique({
      where: { id: dto.doctorId },
      include: { user: { select: { timezone: true } } },
    });
    if (!doctor || !doctor.published) {
      throw new NotFoundException({ error: 'DOCTOR_NOT_FOUND' });
    }

    // ── 4-5. Validate the requested slot (fast-fail UX) ───────────────────
    await this.validateSlot(dto, doctor);

    // ── 6-7. Insert ───────────────────────────────────────────────────────
    let created: Appointment;
    try {
      created = await this.insertNew(dto, {
        patient: { id: patientProfile.id, user: patientUser },
        doctor,
        start: new Date(dto.scheduledStartAt),
        end: new Date(dto.scheduledEndAt),
      });
    } catch (e) {
      // Race winner already booked? Translate to 409 SLOT_TAKEN.
      if (isOverlapViolation(e)) {
        throw new ConflictException({
          error: 'SLOT_TAKEN',
          message: 'That slot is no longer available',
        });
      }
      // Race on idempotency key (concurrent retry)?
      if (isUniqueViolation(e, 'idempotencyKey')) {
        const winner = await this.db.appointment.findUnique({
          where: { idempotencyKey: dto.idempotencyKey },
        });
        if (winner) return AppointmentResponseDto.from(winner);
        // Fall through; shouldn't happen.
      }
      throw e;
    }

    // ── 8. Post-commit side effects ───────────────────────────────────────
    this.events.emit(APPOINTMENT_CREATED, {
      appointmentId: created.id,
      doctorId: created.doctorId,
      patientId: created.patientId,
    });

    // Fire-and-forget; failures logged but never block the response.
    void this.availability
      .invalidateCache(created.doctorId)
      .catch((err) => this.logger.warn('cache invalidate failed', err));
    void this.availability
      .recomputeNextAvailable(created.doctorId)
      .catch((err) =>
        this.logger.warn('recompute nextAvailableAt failed', err),
      );

    return AppointmentResponseDto.from(created);
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Slot validation (§6 — fast-fail UX)
  // ──────────────────────────────────────────────────────────────────────────

  private async validateSlot(
    dto: CreateAppointmentDto,
    doctor: BookingContext['doctor'],
  ): Promise<void> {
    const start = new Date(dto.scheduledStartAt);
    const end = new Date(dto.scheduledEndAt);

    // 1. Range checks
    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
      throw new BadRequestException({
        error: 'INVALID_SLOT',
        message: 'Invalid datetime',
      });
    }
    if (end <= start) {
      throw new BadRequestException({
        error: 'INVALID_SLOT',
        message: 'End must be after start',
      });
    }

    // 2. Within booking horizon
    const now = new Date();
    if (start.getTime() <= now.getTime()) {
      throw new BadRequestException({
        error: 'SLOT_OUTSIDE_HORIZON',
        message: 'Slot is in the past',
      });
    }
    const horizonMs = BookingService.MAX_HORIZON_DAYS * 24 * 60 * 60 * 1000;
    if (start.getTime() - now.getTime() > horizonMs) {
      throw new BadRequestException({
        error: 'SLOT_OUTSIDE_HORIZON',
        message: `Beyond ${BookingService.MAX_HORIZON_DAYS}-day horizon`,
      });
    }

    // 3. Slot length matches doctor's grid
    const slotDurationMs = end.getTime() - start.getTime();
    const expectedMs = doctor.appointmentSlotMinutes * 60 * 1000;
    if (slotDurationMs !== expectedMs) {
      throw new BadRequestException({
        error: 'INVALID_SLOT',
        message: `Slot must be exactly ${doctor.appointmentSlotMinutes} minutes`,
      });
    }

    // 4. Slot lines up with the doctor's grid (full correctness via solver)
    const slots = await this.availability.getBookableSlots(
      doctor.id,
      start,
      end,
    );
    const matches = slots.slots.some(
      (s) =>
        s.startAt.getTime() === start.getTime() &&
        s.endAt.getTime() === end.getTime(),
    );
    if (!matches) {
      throw new BadRequestException({
        error: 'INVALID_SLOT',
        message: "Requested time is not in the doctor's published availability",
      });
    }
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Transactional insert (§7)
  // ──────────────────────────────────────────────────────────────────────────

  private async insertNew(
    dto: CreateAppointmentDto,
    ctx: BookingContext,
  ): Promise<Appointment> {
    return this.db.$transaction(async (tx) => {
      const created = await tx.appointment.create({
        data: {
          idempotencyKey: dto.idempotencyKey,
          patientId: ctx.patient.id,
          doctorId: ctx.doctor.id,
          scheduledStartAt: ctx.start,
          scheduledEndAt: ctx.end,
          conditionTitle: dto.conditionTitle,
          context: dto.context,
          images: dto.images ?? [],
          type:
            ctx.doctor.modeOfConsultation === 'BOTH'
              ? dto.type ?? 'IN_PERSON'
              : (ctx.doctor.modeOfConsultation as AppointmentType),
          priceAtBookingMinor: this.computePrice(ctx.doctor),
          status: 'PENDING',
        },
      });

      // Record null → PENDING in the audit log inside the same transaction.
      // Self-loop convention: previousStatus = PENDING with metadata.event = 'created'
      await tx.appointmentLog.create({
        data: {
          appointmentId: created.id,
          previousStatus: 'PENDING',
          newStatus: 'PENDING',
          changedBy: ctx.patient.user.id,
          reason: null,
          metadata: { event: 'created' } as Prisma.InputJsonValue,
        },
      });

      return created;
    });
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Pricing (§7 note)
  // ──────────────────────────────────────────────────────────────────────────

  /**
   * Computes the price at booking time in minor units (pesewas).
   * perHourRate * appointmentSlotMinutes / 60, rounded.
   * Frozen at booking so a later rate change doesn't affect existing bookings.
   */
  private computePrice(doctor: {
    perHourRate: number;
    appointmentSlotMinutes: number;
  }): number {
    return Math.round(
      (doctor.perHourRate * doctor.appointmentSlotMinutes) / 60,
    );
  }
}
