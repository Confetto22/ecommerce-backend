import { User } from 'src/modules/user/entities/user.entity';

export class PatientProfile {
  id: string;
  userId: string;
  dateOfBirth: Date;

  bloodType: string | null;
  allergies: string[];
  medicalConditions: string[];
  emergencyContactPhone: string | null;
  emergencyContactName: string | null;
  createdAt: Date;
  updatedAt: Date;

  /** Present when the query uses `include: { user: true }`. */
  user?: User;

  constructor(partial: Partial<PatientProfile>) {
    Object.assign(this, partial);
  }
}
