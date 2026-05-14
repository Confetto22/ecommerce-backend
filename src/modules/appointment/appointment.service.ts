import {
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import {
  Appointment,
  AppointmentStatus,
  Prisma,
} from 'generated/prisma/client';
import { User } from '../user/entities/user.entity';
import { PrismaService } from 'src/infrastructure/database/prisma.service';
import { AppointmentStateMachine } from './state-machine/appointment-state-machine';
import { AvailabilityService } from '../availability/availability.service';
import {
  AppointmentResponseDto,
  AppointmentDetailResponseDto,
  AppointmentWithRelations,
  PageMeta,
} from './dto/appointment-response.dto';
import { RejectAppointmentDto } from './dto/reject-appointment.dto';
import { CancelAppointmentDto } from './dto/cancel-appointment.dto';
import { RescheduleAppointmentDto } from './dto/reschedule-appointment.dto';
import {
  RespondToRescheduleDto,
  RescheduleAction,
} from './dto/respond-to-reschedule.dto';
import { ListAppointmentsQueryDto } from './dto/list-appointments-query.dto';
import {
  APPOINTMENT_APPROVED,
  APPOINTMENT_CANCELLED,
  APPOINTMENT_REJECTED,
  APPOINTMENT_RESCHEDULED,
} from './events/appointment.events';

// ── Prisma include fragments for doctor/patient relations ─────────────────
const APPOINTMENT_INCLUDE = {
  doctor: { include: { user: { select: { username: true, photo: true, timezone: true } } } },
  patient: { include: { user: { select: { username: true } } } },
} satisfies Prisma.AppointmentInclude;

const APPOINTMENT_DETAIL_INCLUDE = {
  ...APPOINTMENT_INCLUDE,
  appointmentLogs: {
    orderBy: { createdAt: 'asc' as const },
    include: { changedByUser: { select: { id: true, username: true } } },
  },
} satisfies Prisma.AppointmentInclude;

@Injectable()
export class AppointmentService {
  private readonly logger = new Logger(AppointmentService.name);

  constructor(
    private readonly db: PrismaService,
    private readonly stateMachine: AppointmentStateMachine,
    private readonly events: EventEmitter2,
    private readonly availability: AvailabilityService,
  ) {}

  // ──────────────────────────────────────────────────────────────────────────
  // Read endpoints (Phase E)
  // ──────────────────────────────────────────────────────────────────────────

  /**
   * GET /appointments/me — patient's own appointment list.
   * Filterable by status, date range. Paginated.
   */
  async listForPatient(
    user: User,
    query: ListAppointmentsQueryDto,
  ): Promise<{ items: AppointmentResponseDto[]; meta: PageMeta }> {
    const profile = await this.db.patientProfile.findUnique({
      where: { userId: user.id },
    });
    if (!profile) return this.emptyPage(query);

    const where = this.buildWhereClause({ patientId: profile.id }, query);

    const [items, total] = await Promise.all([
      this.db.appointment.findMany({
        where,
        orderBy: [{ scheduledStartAt: 'asc' }],
        skip: ((query.page ?? 1) - 1) * (query.limit ?? 20),
        take: query.limit ?? 20,
        include: APPOINTMENT_INCLUDE,
      }),
      this.db.appointment.count({ where }),
    ]);

    return {
      items: items.map((a) =>
        AppointmentResponseDto.fromWithRelations(a as unknown as AppointmentWithRelations),
      ),
      meta: this.toMeta(query, total),
    };
  }

  /**
   * GET /appointments/inbox — doctor's inbox.
   * Pending first (via enum ordering), then by scheduledStartAt.
   */
  async listForDoctor(
    user: User,
    query: ListAppointmentsQueryDto,
  ): Promise<{ items: AppointmentResponseDto[]; meta: PageMeta }> {
    const doctor = await this.db.doctorProfile.findUnique({
      where: { userId: user.id },
    });
    if (!doctor) return this.emptyPage(query);

    const where = this.buildWhereClause({ doctorId: doctor.id }, query);

    const [items, total] = await Promise.all([
      this.db.appointment.findMany({
        where,
        orderBy: [
          // Pending first when no status filter ("triage" view)
          { status: 'asc' },
          { scheduledStartAt: 'asc' },
        ],
        skip: ((query.page ?? 1) - 1) * (query.limit ?? 20),
        take: query.limit ?? 20,
        include: APPOINTMENT_INCLUDE,
      }),
      this.db.appointment.count({ where }),
    ]);

    return {
      items: items.map((a) =>
        AppointmentResponseDto.fromWithRelations(a as unknown as AppointmentWithRelations),
      ),
      meta: this.toMeta(query, total),
    };
  }

  /**
   * GET /appointments/:id — single appointment detail with log timeline.
   * Both participants can view.
   */
  async findById(
    user: User,
    id: string,
  ): Promise<AppointmentDetailResponseDto> {
    const appt = await this.db.appointment.findUnique({
      where: { id },
      include: APPOINTMENT_DETAIL_INCLUDE,
    });
    if (!appt) {
      throw new NotFoundException({ error: 'APPOINTMENT_NOT_FOUND' });
    }

    // Verify caller is a participant (using the included relation data)
    await this.assertParticipantFromRelations(appt as any, user);

    return AppointmentDetailResponseDto.fromDetail(appt as any);
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Lifecycle methods — each follows the canonical pattern from §3.3:
  //   1. tx: read → validate ownership → assertAndLog → guardedUpdate
  //   2. post-commit: emit event, invalidate + recompute availability
  // ──────────────────────────────────────────────────────────────────────────

  /**
   * PENDING → APPROVED (DOCTOR only)
   */
  async approve(
    appointmentId: string,
    doctorUser: User,
  ): Promise<AppointmentResponseDto> {
    const updated = await this.db.$transaction(async (tx) => {
      const appt = await this.findOrFail(tx, appointmentId);
      await this.assertDoctorOwns(tx, appt, doctorUser);

      await this.stateMachine.assertAndLog(tx, {
        appointmentId: appt.id,
        fromStatus: appt.status,
        toStatus: 'APPROVED',
        actorUserId: doctorUser.id,
        actorRole: 'DOCTOR',
      });

      return this.guardedUpdate(tx, appt.id, appt.status, {
        status: 'APPROVED',
      });
    });

    this.events.emit(APPOINTMENT_APPROVED, {
      appointmentId: updated.id,
      doctorId: updated.doctorId,
    });
    void this.invalidateAndRecompute(updated.doctorId);
    return AppointmentResponseDto.from(updated);
  }

  /**
   * PENDING → CANCELLED (DOCTOR only, semantically a "rejection")
   */
  async reject(
    appointmentId: string,
    doctorUser: User,
    dto: RejectAppointmentDto,
  ): Promise<AppointmentResponseDto> {
    const updated = await this.db.$transaction(async (tx) => {
      const appt = await this.findOrFail(tx, appointmentId);
      await this.assertDoctorOwns(tx, appt, doctorUser);

      await this.stateMachine.assertAndLog(tx, {
        appointmentId: appt.id,
        fromStatus: appt.status,
        toStatus: 'CANCELLED',
        actorUserId: doctorUser.id,
        actorRole: 'DOCTOR',
        reason: dto.reason,
      });

      return this.guardedUpdate(tx, appt.id, appt.status, {
        status: 'CANCELLED',
        reason: dto.reason,
        cancelledBy: doctorUser.id,
      });
    });

    this.events.emit(APPOINTMENT_REJECTED, {
      appointmentId: updated.id,
      doctorId: updated.doctorId,
      reason: dto.reason,
    });
    void this.invalidateAndRecompute(updated.doctorId);
    return AppointmentResponseDto.from(updated);
  }

  /**
   * PENDING | APPROVED | RESCHEDULED → CANCELLED (either party)
   */
  async cancel(
    appointmentId: string,
    user: User,
    dto: CancelAppointmentDto,
  ): Promise<AppointmentResponseDto> {
    const updated = await this.db.$transaction(async (tx) => {
      const appt = await this.findOrFail(tx, appointmentId);
      await this.assertParticipant(tx, appt, user);

      await this.stateMachine.assertAndLog(tx, {
        appointmentId: appt.id,
        fromStatus: appt.status,
        toStatus: 'CANCELLED',
        actorUserId: user.id,
        actorRole: user.role,
        reason: dto.reason,
      });

      return this.guardedUpdate(tx, appt.id, appt.status, {
        status: 'CANCELLED',
        reason: dto.reason ?? null,
        cancelledBy: user.id,
      });
    });

    this.events.emit(APPOINTMENT_CANCELLED, {
      appointmentId: updated.id,
      doctorId: updated.doctorId,
      cancelledBy: user.id,
    });
    void this.invalidateAndRecompute(updated.doctorId);
    return AppointmentResponseDto.from(updated);
  }

  /**
   * PENDING | APPROVED → RESCHEDULED (DOCTOR only, proposes new time)
   */
  async reschedule(
    appointmentId: string,
    doctorUser: User,
    dto: RescheduleAppointmentDto,
  ): Promise<AppointmentResponseDto> {
    const proposedStartAt = new Date(dto.proposedStartAt);
    const proposedEndAt = new Date(dto.proposedEndAt);

    const updated = await this.db.$transaction(async (tx) => {
      const appt = await this.findOrFail(tx, appointmentId);
      await this.assertDoctorOwns(tx, appt, doctorUser);

      await this.stateMachine.assertAndLog(tx, {
        appointmentId: appt.id,
        fromStatus: appt.status,
        toStatus: 'RESCHEDULED',
        actorUserId: doctorUser.id,
        actorRole: 'DOCTOR',
        metadata: {
          proposedStartAt: proposedStartAt.toISOString(),
          proposedEndAt: proposedEndAt.toISOString(),
        },
      });

      return this.guardedUpdate(tx, appt.id, appt.status, {
        status: 'RESCHEDULED',
        proposedStartAt,
        proposedEndAt,
        proposedAt: new Date(),
        proposalRound: { increment: 1 },
      });
    });

    this.events.emit(APPOINTMENT_RESCHEDULED, {
      appointmentId: updated.id,
      doctorId: updated.doctorId,
    });
    void this.invalidateAndRecompute(updated.doctorId);
    return AppointmentResponseDto.from(updated);
  }

  /**
   * RESCHEDULED → APPROVED (accept) | RESCHEDULED (counter) | CANCELLED (cancel)
   * PATIENT only.
   */
  async respondToReschedule(
    appointmentId: string,
    patientUser: User,
    dto: RespondToRescheduleDto,
  ): Promise<AppointmentResponseDto> {
    const updated = await this.db.$transaction(async (tx) => {
      const appt = await this.findOrFail(tx, appointmentId);
      await this.assertPatientOwns(tx, appt, patientUser);

      switch (dto.action) {
        case RescheduleAction.ACCEPT:
          return this.handleAccept(tx, appt, patientUser);

        case RescheduleAction.COUNTER:
          return this.handleCounter(tx, appt, patientUser, dto);

        case RescheduleAction.CANCEL:
          return this.handleRescheduleCancel(tx, appt, patientUser, dto);
      }
    });

    // Emit the appropriate event based on final status
    if (updated.status === 'APPROVED') {
      this.events.emit(APPOINTMENT_APPROVED, {
        appointmentId: updated.id,
        doctorId: updated.doctorId,
      });
    } else if (updated.status === 'RESCHEDULED') {
      this.events.emit(APPOINTMENT_RESCHEDULED, {
        appointmentId: updated.id,
        doctorId: updated.doctorId,
      });
    } else if (updated.status === 'CANCELLED') {
      this.events.emit(APPOINTMENT_CANCELLED, {
        appointmentId: updated.id,
        doctorId: updated.doctorId,
        cancelledBy: patientUser.id,
      });
    }

    void this.invalidateAndRecompute(updated.doctorId);
    return AppointmentResponseDto.from(updated);
  }

  // ──────────────────────────────────────────────────────────────────────────
  // respondToReschedule sub-handlers
  // ──────────────────────────────────────────────────────────────────────────

  /**
   * ACCEPT: apply the doctor's proposal as the new schedule.
   * RESCHEDULED → APPROVED
   */
  private async handleAccept(
    tx: Prisma.TransactionClient,
    appt: Appointment,
    patientUser: User,
  ): Promise<Appointment> {
    await this.stateMachine.assertAndLog(tx, {
      appointmentId: appt.id,
      fromStatus: appt.status,
      toStatus: 'APPROVED',
      actorUserId: patientUser.id,
      actorRole: 'PATIENT',
    });

    return this.guardedUpdate(tx, appt.id, appt.status, {
      status: 'APPROVED',
      // Apply proposal → scheduled
      scheduledStartAt: appt.proposedStartAt!,
      scheduledEndAt: appt.proposedEndAt!,
      // Clear proposal columns
      proposedStartAt: null,
      proposedEndAt: null,
      proposedAt: null,
    });
  }

  /**
   * COUNTER: patient proposes an alternative time.
   * RESCHEDULED → RESCHEDULED (only if proposalRound < 2)
   */
  private async handleCounter(
    tx: Prisma.TransactionClient,
    appt: Appointment,
    patientUser: User,
    dto: RespondToRescheduleDto,
  ): Promise<Appointment> {
    // Policy check — before the state machine (§6)
    if (appt.proposalRound >= 2) {
      throw new ConflictException({
        message:
          'Reschedule limit reached. You must accept or cancel the appointment.',
        error: 'RESCHEDULE_LIMIT_REACHED',
      });
    }

    const proposedStartAt = new Date(dto.proposedStartAt!);
    const proposedEndAt = new Date(dto.proposedEndAt!);

    await this.stateMachine.assertAndLog(tx, {
      appointmentId: appt.id,
      fromStatus: appt.status,
      toStatus: 'RESCHEDULED',
      actorUserId: patientUser.id,
      actorRole: 'PATIENT',
      metadata: {
        proposedStartAt: proposedStartAt.toISOString(),
        proposedEndAt: proposedEndAt.toISOString(),
      },
    });

    return this.guardedUpdate(tx, appt.id, appt.status, {
      status: 'RESCHEDULED',
      proposedStartAt,
      proposedEndAt,
      proposedAt: new Date(),
      proposalRound: { increment: 1 },
    });
  }

  /**
   * CANCEL via respond-to-reschedule: RESCHEDULED → CANCELLED
   */
  private async handleRescheduleCancel(
    tx: Prisma.TransactionClient,
    appt: Appointment,
    patientUser: User,
    dto: RespondToRescheduleDto,
  ): Promise<Appointment> {
    await this.stateMachine.assertAndLog(tx, {
      appointmentId: appt.id,
      fromStatus: appt.status,
      toStatus: 'CANCELLED',
      actorUserId: patientUser.id,
      actorRole: 'PATIENT',
      reason: dto.reason,
    });

    return this.guardedUpdate(tx, appt.id, appt.status, {
      status: 'CANCELLED',
      reason: dto.reason ?? null,
      cancelledBy: patientUser.id,
    });
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Shared helpers
  // ──────────────────────────────────────────────────────────────────────────

  /**
   * Find an appointment or throw 404.
   */
  private async findOrFail(
    tx: Prisma.TransactionClient,
    appointmentId: string,
  ): Promise<Appointment> {
    const appt = await tx.appointment.findUnique({
      where: { id: appointmentId },
    });
    if (!appt) {
      throw new NotFoundException({
        message: 'Appointment not found.',
        error: 'APPOINTMENT_NOT_FOUND',
      });
    }
    return appt;
  }

  /**
   * Optimistic CAS update (§4.1). Updates only if the row is still in the
   * expected status. Returns the full updated row on success, throws
   * INVALID_TRANSITION on race loss.
   */
  private async guardedUpdate(
    tx: Prisma.TransactionClient,
    appointmentId: string,
    expectedStatus: AppointmentStatus,
    data: Prisma.AppointmentUncheckedUpdateManyInput,
  ): Promise<Appointment> {
    const result = await tx.appointment.updateMany({
      where: { id: appointmentId, status: expectedStatus },
      data,
    });

    if (result.count === 0) {
      throw new ConflictException({
        message: 'Appointment status changed concurrently. Reload and retry.',
        error: 'INVALID_TRANSITION',
      });
    }

    // updateMany doesn't return the row, so re-read it
    return tx.appointment.findUniqueOrThrow({
      where: { id: appointmentId },
    });
  }

  /**
   * Assert the calling doctor owns this appointment.
   * Looks up DoctorProfile by userId and compares against appt.doctorId.
   */
  private async assertDoctorOwns(
    tx: Prisma.TransactionClient,
    appt: { doctorId: string },
    doctorUser: User,
  ): Promise<void> {
    const profile = await tx.doctorProfile.findUnique({
      where: { userId: doctorUser.id },
      select: { id: true },
    });
    if (!profile || profile.id !== appt.doctorId) {
      throw new ForbiddenException({
        message: 'You are not the doctor for this appointment.',
        error: 'NOT_APPOINTMENT_PARTICIPANT',
      });
    }
  }

  /**
   * Assert the calling patient owns this appointment.
   * Looks up PatientProfile by userId and compares against appt.patientId.
   */
  private async assertPatientOwns(
    tx: Prisma.TransactionClient,
    appt: { patientId: string },
    patientUser: User,
  ): Promise<void> {
    const profile = await tx.patientProfile.findUnique({
      where: { userId: patientUser.id },
      select: { id: true },
    });
    if (!profile || profile.id !== appt.patientId) {
      throw new ForbiddenException({
        message: 'You are not the patient for this appointment.',
        error: 'NOT_APPOINTMENT_PARTICIPANT',
      });
    }
  }

  /**
   * Assert the caller is either the doctor or the patient of this appointment.
   * Used by cancel() where both parties are allowed.
   */
  private async assertParticipant(
    tx: Prisma.TransactionClient,
    appt: { doctorId: string; patientId: string },
    user: User,
  ): Promise<void> {
    if (user.role === 'DOCTOR') {
      return this.assertDoctorOwns(tx, appt, user);
    }
    return this.assertPatientOwns(tx, appt, user);
  }

  /**
   * Assert participant using already-included relation data.
   * Used by the detail endpoint (findById) where doctor/patient are already loaded.
   */
  private async assertParticipantFromRelations(
    appt: AppointmentWithRelations,
    user: User,
  ): Promise<void> {
    const isDoctor = appt.doctor?.userId === user.id;
    const isPatient = appt.patient?.userId === user.id;
    if (!isDoctor && !isPatient) {
      throw new ForbiddenException({
        message: 'You are not a participant in this appointment.',
        error: 'NOT_APPOINTMENT_PARTICIPANT',
      });
    }
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Cache & availability hooks (§15 of 05d)
  // ──────────────────────────────────────────────────────────────────────────

  /**
   * Post-commit hook: invalidate cache + recompute nextAvailableAt.
   * Uses allSettled so a Redis outage doesn't block the appointment response.
   */
  private async invalidateAndRecompute(doctorId: string): Promise<void> {
    await Promise.allSettled([
      this.availability.invalidateCache(doctorId),
      this.availability.recomputeNextAvailable(doctorId),
    ]).catch((err) =>
      this.logger.warn('invalidateAndRecompute failed', err),
    );
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Pagination helpers
  // ──────────────────────────────────────────────────────────────────────────

  /**
   * Build the Prisma WHERE clause from common filters.
   */
  private buildWhereClause(
    base: Prisma.AppointmentWhereInput,
    query: ListAppointmentsQueryDto,
  ): Prisma.AppointmentWhereInput {
    const where: Prisma.AppointmentWhereInput = { ...base };
    if (query.status) where.status = query.status;
    if (query.fromDate || query.toDate) {
      where.scheduledStartAt = {};
      if (query.fromDate) {
        (where.scheduledStartAt as Prisma.DateTimeFilter).gte = new Date(query.fromDate);
      }
      if (query.toDate) {
        (where.scheduledStartAt as Prisma.DateTimeFilter).lte = new Date(query.toDate);
      }
    }
    return where;
  }

  private toMeta(query: ListAppointmentsQueryDto, total: number): PageMeta {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    return {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    };
  }

  private emptyPage(query: ListAppointmentsQueryDto): {
    items: AppointmentResponseDto[];
    meta: PageMeta;
  } {
    return { items: [], meta: this.toMeta(query, 0) };
  }
}
