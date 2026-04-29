import type { Role } from 'generated/prisma/enums';
import { Type } from 'class-transformer';
import {
  IsDate,
  IsEmail,
  IsIn,
  IsOptional,
  IsString,
  IsStrongPassword,
  MinLength,
} from 'class-validator';

export class CreateUserDto {
  @IsString()
  @MinLength(3)
  firstname: string;

  @IsString()
  @MinLength(3)
  lastname: string;

  @IsEmail()
  email: string;

  @IsString()
  location: string;

  @IsString()
  phone: string;

  @IsIn(['DOCTOR', 'PATIENT'])
  role: Role;

  @IsOptional()
  @IsString()
  profilePhoto: string | null;

  @IsString()
  city: string;

  @IsString()
  state: string;

  @IsString()
  country: string;

  @IsOptional()
  refreshToken?: string;

  @IsOptional()
  @Type(() => Date)
  @IsDate()
  emailVerifiedAt: Date | null;

  @IsOptional()
  @IsString()
  patientProfile: string | null;

  @IsOptional()
  @IsString()
  doctorProfile: string | null;

  @IsString()
  @MinLength(8)
  @IsStrongPassword()
  password: string;
}
