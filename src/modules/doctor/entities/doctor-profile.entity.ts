import type { consultationTypes } from 'generated/prisma/enums';

import { User } from '../../user/entities/user.entity';

/**
 * API representation of a `DoctorProfile` row. Mirrors the Prisma model
 * scalars; relations are optional so you can return plain profile rows or
 * `include` payloads from the service layer.
 */
export class DoctorProfile {
  id: string;
  userId: string;
  yearsOfExperience: number;
  educationLevel: string;
  institution: string;
  /** Hourly rate in minor units (e.g. pesewas). */
  perHourRate: number;
  totalRatings: number;
  averageRating: number | null;
  appointmentSlotMinutes: number;
  bio: string | null;
  published: boolean;
  specialties: string[];
  languages: string[];
  modeOfConsultation: consultationTypes;
  createdAt: Date;
  updatedAt: Date;

  /** Present when the query uses `include: { user: true }`. */
  user?: User;

  constructor(partial: Partial<DoctorProfile>) {
    Object.assign(this, partial);
  }
}
