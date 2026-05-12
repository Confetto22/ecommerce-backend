import { Appointment } from 'generated/prisma/client';

/**
 * Consistent response shape for all appointment lifecycle endpoints.
 * Strips internal fields and ensures a stable API contract.
 */
export class AppointmentResponseDto {
  id: string;
  doctorId: string;
  patientId: string;
  status: string;
  type: string;
  context: string;
  conditionTitle: string;
  images: string[];
  scheduledStartAt: Date;
  scheduledEndAt: Date;
  priceAtBookingMinor: number;

  // Reschedule proposal (null when no active proposal)
  proposedStartAt: Date | null;
  proposedEndAt: Date | null;
  proposedAt: Date | null;
  proposalRound: number;

  // Cancellation / rejection
  reason: string | null;
  cancelledBy: string | null;

  createdAt: Date;
  updatedAt: Date;

  static from(appt: Appointment): AppointmentResponseDto {
    const dto = new AppointmentResponseDto();
    dto.id = appt.id;
    dto.doctorId = appt.doctorId;
    dto.patientId = appt.patientId;
    dto.status = appt.status;
    dto.type = appt.type;
    dto.context = appt.context;
    dto.conditionTitle = appt.conditionTitle;
    dto.images = appt.images;
    dto.scheduledStartAt = appt.scheduledStartAt;
    dto.scheduledEndAt = appt.scheduledEndAt;
    dto.priceAtBookingMinor = appt.priceAtBookingMinor;
    dto.proposedStartAt = appt.proposedStartAt;
    dto.proposedEndAt = appt.proposedEndAt;
    dto.proposedAt = appt.proposedAt;
    dto.proposalRound = appt.proposalRound;
    dto.reason = appt.reason;
    dto.cancelledBy = appt.cancelledBy;
    dto.createdAt = appt.createdAt;
    dto.updatedAt = appt.updatedAt;
    return dto;
  }
}
