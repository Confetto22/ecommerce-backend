/*
  Warnings:

  - Changed the type of `modesOfConsultation` on the `doctor_profiles` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.

*/
-- CreateEnum
CREATE TYPE "consultationTypes" AS ENUM ('VIRTUAL', 'IN_PERSON', 'BOTH');

-- AlterTable
ALTER TABLE "doctor_profiles" DROP COLUMN "modesOfConsultation",
ADD COLUMN     "modesOfConsultation" "consultationTypes" NOT NULL;
