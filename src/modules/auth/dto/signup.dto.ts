import type { GenderType, Role } from 'generated/prisma/enums';
import {
  IsEmail,
  IsIn,
  IsString,
  IsStrongPassword,
  MinLength,
} from 'class-validator';

/**
 * Body for POST /auth/signup only. Profile fields (patient/doctor) belong on
 * POST /patients or POST /doctor after login — do not send them here.
 */
export class SignupDto {
  @IsString()
  @MinLength(3)
  username: string;

  @IsEmail()
  email: string;

  @IsIn(['MALE', 'FEMALE'])
  gender: GenderType;

  @IsIn(['DOCTOR', 'PATIENT'])
  role: Role;

  @IsString()
  city: string;

  @IsString()
  country: string;

  @IsString()
  @MinLength(8)
  @IsStrongPassword()
  password: string;
}
