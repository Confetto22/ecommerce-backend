import {
  Appointment,
  AppointmentLog,
  AppointmentStatus,
  AppointmentType,
  DoctorProfile,
  PatientProfile,
  User,
} from 'generated/prisma/client';

// ──────────────────────────────────────────────────────────────────────────────
// Response shapes (§2 of 05d-m4-lifecycle-endpoints.md)
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Consistent response shape for all appointment lifecycle endpoints.
 * Strips internal fields and ensures a stable API contract.
 */
export class AppointmentResponseDto {
  id: string;
  status: AppointmentStatus;
  type: AppointmentType;

  doctorId: string;
  patientId: string;

  // Populated when the query includes doctor/patient relations
  doctor?: {
    id: string;
    user: { username: string; photo?: string | null; timezone: string };
  };
  patient?: {
    id: string;
    user: { username: string };
  };

  scheduledStartAt: Date;
  scheduledEndAt: Date;

  conditionTitle: string;
  context: string;
  images: string[];

  priceAtBookingMinor: number;
  reason: string | null;
  cancelledBy: string | null;

  proposal: {
    proposedStartAt: Date | null;
    proposedEndAt: Date | null;
    proposedAt: Date | null;
    proposalRound: number;
  };

  createdAt: Date;
  updatedAt: Date;

  /**
   * Build from a plain Appointment row (no relations included).
   * Used by BookingService.create() and lifecycle methods that
   * don't need the doctor/patient relation data.
   */
  static from(appt: Appointment): AppointmentResponseDto {
    const dto = new AppointmentResponseDto();
    dto.id = appt.id;
    dto.status = appt.status;
    dto.type = appt.type;
    dto.doctorId = appt.doctorId;
    dto.patientId = appt.patientId;
    dto.scheduledStartAt = appt.scheduledStartAt;
    dto.scheduledEndAt = appt.scheduledEndAt;
    dto.conditionTitle = appt.conditionTitle;
    dto.context = appt.context;
    dto.images = appt.images;
    dto.priceAtBookingMinor = appt.priceAtBookingMinor;
    dto.reason = appt.reason;
    dto.cancelledBy = appt.cancelledBy;
    dto.proposal = {
      proposedStartAt: appt.proposedStartAt,
      proposedEndAt: appt.proposedEndAt,
      proposedAt: appt.proposedAt,
      proposalRound: appt.proposalRound,
    };
    dto.createdAt = appt.createdAt;
    dto.updatedAt = appt.updatedAt;
    return dto;
  }

  /**
   * Build from an Appointment row with doctor/patient relations included.
   * Used by list and detail endpoints that join doctor/patient profiles.
   */
  static fromWithRelations(appt: AppointmentWithRelations): AppointmentResponseDto {
    const dto = AppointmentResponseDto.from(appt);
    if (appt.doctor) {
      dto.doctor = {
        id: appt.doctor.id,
        user: {
          username: appt.doctor.user.username,
          photo: appt.doctor.user.photo ?? null,
          timezone: appt.doctor.user.timezone,
        },
      };
    }
    if (appt.patient) {
      dto.patient = {
        id: appt.patient.id,
        user: {
          username: appt.patient.user.username,
        },
      };
    }
    return dto;
  }
}

/**
 * Extended response with log timeline, used by GET /appointments/:id
 */
export class AppointmentDetailResponseDto extends AppointmentResponseDto {
  logs: Array<{
    id: string;
    previousStatus: AppointmentStatus;
    newStatus: AppointmentStatus;
    changedBy: { id: string; username: string };
    reason: string | null;
    metadata: Record<string, unknown> | null;
    createdAt: Date;
  }>;

  static fromDetail(appt: AppointmentWithRelationsAndLogs): AppointmentDetailResponseDto {
    const dto = new AppointmentDetailResponseDto();
    // Copy all base fields
    Object.assign(dto, AppointmentResponseDto.fromWithRelations(appt));

    dto.logs = appt.appointmentLogs.map((log) => ({
      id: log.id,
      previousStatus: log.previousStatus,
      newStatus: log.newStatus,
      changedBy: {
        id: log.changedByUser.id,
        username: log.changedByUser.username,
      },
      reason: log.reason,
      metadata: log.metadata as Record<string, unknown> | null,
      createdAt: log.createdAt,
    }));

    return dto;
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// Prisma result types with relations
// ──────────────────────────────────────────────────────────────────────────────

/** Appointment with doctor and patient profiles joined */
export type AppointmentWithRelations = Appointment & {
  doctor: DoctorProfile & {
    user: { username: string; photo: string | null; timezone: string };
  };
  patient: PatientProfile & {
    user: { username: string };
  };
};

/** Appointment with relations AND log timeline */
export type AppointmentWithRelationsAndLogs = AppointmentWithRelations & {
  appointmentLogs: Array<
    AppointmentLog & {
      changedByUser: { id: string; username: string };
    }
  >;
};

// ──────────────────────────────────────────────────────────────────────────────
// Pagination metadata
// ──────────────────────────────────────────────────────────────────────────────

export interface PageMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}
