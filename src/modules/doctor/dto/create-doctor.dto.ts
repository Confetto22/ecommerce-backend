import { consultationTypes } from 'generated/prisma/enums';

export class CreateDoctorDto {
  userId: string;
  specialties: string[];
  yearsOfExperience: number;
  educationLevel: string;
  institution: string;
  appointmentSlotMinutes: number;
  totalPatients?: number;
  bio?: string;
  perHourRate: number;
  daysOfOperation: string[];
  averageRating?: number;
  totalReviews: number;
  modeOfConsultation: consultationTypes;
}
