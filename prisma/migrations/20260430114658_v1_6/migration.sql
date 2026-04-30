/*
  Warnings:

  - You are about to drop the column `modesOfConsultation` on the `doctor_profiles` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "doctor_profiles" DROP COLUMN "modesOfConsultation",
ADD COLUMN     "modeOfConsultation" "consultationTypes" NOT NULL DEFAULT 'IN_PERSON';
