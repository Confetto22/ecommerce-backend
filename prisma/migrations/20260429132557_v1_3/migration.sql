/*
  Warnings:

  - You are about to drop the column `priceAtBooking` on the `Appointment` table. All the data in the column will be lost.
  - Added the required column `priceAtBookingMinor` to the `Appointment` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "Appointment" DROP COLUMN "priceAtBooking",
ADD COLUMN     "priceAtBookingMinor" INTEGER NOT NULL;
