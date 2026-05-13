-- AlterTable
ALTER TABLE "Appointment" ADD COLUMN     "cancelledBy" TEXT,
ADD COLUMN     "proposalRound" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "proposedAt" TIMESTAMP(3),
ADD COLUMN     "proposedEndAt" TIMESTAMP(3),
ADD COLUMN     "proposedStartAt" TIMESTAMP(3),
ADD COLUMN     "reason" TEXT;

-- AlterTable
ALTER TABLE "AppointmentLog" ADD COLUMN     "metadata" JSONB,
ADD COLUMN     "reason" TEXT;

-- Required for GIST index on a uuid (doctorId) alongside a tstzrange.
CREATE EXTENSION IF NOT EXISTS btree_gist;

-- No two PENDING / RESCHEDULED / APPROVED / IN_SESSION appointments may overlap
-- on the same doctor. Use tsrange (not tstzrange): Prisma DateTime maps to TIMESTAMP,
-- and tstzrange(...) on timestamp columns is not IMMUTABLE for index expressions.
ALTER TABLE "Appointment"
  ADD CONSTRAINT "Appointment_no_overlap_per_doctor"
  EXCLUDE USING GIST (
    "doctorId" WITH =,
    tsrange("scheduledStartAt", "scheduledEndAt", '[)') WITH &&
  )
  WHERE ("status" IN ('PENDING', 'RESCHEDULED', 'APPROVED', 'IN_SESSION'));

-- CreateIndex
CREATE INDEX "Appointment_doctorId_status_idx" ON "Appointment"("doctorId", "status");

-- CreateIndex
CREATE INDEX "Appointment_patientId_status_idx" ON "Appointment"("patientId", "status");

-- CreateIndex
CREATE INDEX "AppointmentLog_appointmentId_createdAt_idx" ON "AppointmentLog"("appointmentId", "createdAt");
