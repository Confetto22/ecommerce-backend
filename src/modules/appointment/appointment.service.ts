import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Appointment, AppointmentStatus, Prisma } from 'generated/prisma/client';
import { User } from '../user/entities/user.entity';
import { PrismaService } from 'src/infrastructure/database/prisma.service';
import { AppointmentStateMachine } from './state-machine/appointment-state-machine';
import { AvailabilityService } from '../availability/availability.service';
import { AppointmentResponseDto } from './dto/appointment-response.dto';
import { RejectAppointmentDto } from './dto/reject-appointment.dto';
import { CancelAppointmentDto } from './dto/cancel-appointment.dto';
import { RescheduleAppointmentDto } from './dto/reschedule-appointment.dto';
import {
  RespondToRescheduleDto,
  RescheduleAction,
} from './dto/respond-to-reschedule.dto';
import {
  APPOINTMENT_APPROVED,
  APPOINTMENT_CANCELLED,
  APPOINTMENT_REJECTED,
  APPOINTMENT_RESCHEDULED,
} from './events/appointment.events';

@Injectable()
export class AppointmentService {
  constructor(
    private readonly db: PrismaService,
    private readonly stateMachine: AppointmentStateMachine,
    private readonly events: EventEmitter2,
    private readonly availability: AvailabilityService,
  ) {}

  // ──────────────────────────────────────────────────────────────────────────
  // Lifecycle methods — each follows the canonical pattern from §3.3:
  //   1. tx: read → validate ownership → assertAndLog → guardedUpdate
  //   2. post-commit: emit event, recompute availability
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

    this.events.emit(APPOINTMENT_APPROVED, { appointmentId: updated.id });
    void this.availability.recomputeNextAvailable(updated.doctorId);
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

    this.events.emit(APPOINTMENT_REJECTED, { appointmentId: updated.id });
    void this.availability.recomputeNextAvailable(updated.doctorId);
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

    this.events.emit(APPOINTMENT_CANCELLED, { appointmentId: updated.id });
    void this.availability.recomputeNextAvailable(updated.doctorId);
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

    this.events.emit(APPOINTMENT_RESCHEDULED, { appointmentId: updated.id });
    void this.availability.recomputeNextAvailable(updated.doctorId);
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
      this.events.emit(APPOINTMENT_APPROVED, { appointmentId: updated.id });
    } else if (updated.status === 'RESCHEDULED') {
      this.events.emit(APPOINTMENT_RESCHEDULED, { appointmentId: updated.id });
    } else if (updated.status === 'CANCELLED') {
      this.events.emit(APPOINTMENT_CANCELLED, { appointmentId: updated.id });
    }

    void this.availability.recomputeNextAvailable(updated.doctorId);
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
}
