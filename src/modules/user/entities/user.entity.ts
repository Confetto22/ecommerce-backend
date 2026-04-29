import { Exclude } from 'class-transformer';
import type { Role } from 'generated/prisma/enums';
import { Session } from './session.entity';

export class User {
  id: string;
  firstname: string;
  lastname: string;
  email: string;
  location: string;
  phone: string;
  role: Role;
  createdAt: Date;
  updatedAt: Date;
  profilePhoto: string | null;
  city: string;
  state: string;
  country: string;
  emailVerifiedAt: Date | null;
  patientProfile: string | null;
  doctorProfile: string | null;

  @Exclude()
  password?: string;

  @Exclude()
  sessions?: Session[];

  @Exclude()
  tokens?: any[];

  constructor(partial: Partial<User>) {
    Object.assign(this, partial);
  }
}
