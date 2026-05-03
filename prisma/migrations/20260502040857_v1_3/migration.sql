/*
  Warnings:

  - You are about to drop the column `photo` on the `doctor_profiles` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "doctor_profiles" DROP COLUMN "photo",
ADD COLUMN     "languages" TEXT[],
ADD COLUMN     "published" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "specialties" TEXT[];

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "phone" TEXT,
ADD COLUMN     "photo" TEXT,
ADD COLUMN     "timezone" TEXT NOT NULL DEFAULT 'UTC';
