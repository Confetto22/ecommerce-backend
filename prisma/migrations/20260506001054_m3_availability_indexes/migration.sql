/*
  Warnings:

  - Added the required column `kind` to the `DoctorAvailability` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "AvailabilityKind" AS ENUM ('RECURRING', 'OVERRIDE', 'BLACKOUT');

-- DropIndex
DROP INDEX "DoctorAvailability_doctorId_date_idx";

-- DropIndex
DROP INDEX "DoctorAvailability_doctorId_weekday_idx";

-- AlterTable
ALTER TABLE "DoctorAvailability" ADD COLUMN     "isActive" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "kind" "AvailabilityKind" NOT NULL;

-- AlterTable
ALTER TABLE "doctor_profiles" ADD COLUMN     "nextAvailableAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "DoctorAvailability_doctorId_kind_weekday_idx" ON "DoctorAvailability"("doctorId", "kind", "weekday");

-- CreateIndex
CREATE INDEX "DoctorAvailability_doctorId_kind_date_idx" ON "DoctorAvailability"("doctorId", "kind", "date");

-- CreateIndex
CREATE INDEX "doctor_profiles_published_nextAvailableAt_idx" ON "doctor_profiles"("published", "nextAvailableAt");
