/**
 * Domain event constants for the appointment lifecycle.
 * M5 will subscribe to these for notifications; M4 only emits them.
 */
export const APPOINTMENT_CREATED = 'appointment.created';
export const APPOINTMENT_APPROVED = 'appointment.approved';
export const APPOINTMENT_REJECTED = 'appointment.rejected';
export const APPOINTMENT_RESCHEDULED = 'appointment.rescheduled';
export const APPOINTMENT_CANCELLED = 'appointment.cancelled';
