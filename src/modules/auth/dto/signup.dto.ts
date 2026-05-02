import {
  IsEmail,
  IsEnum,
  IsOptional,
  IsString,
  MinLength,
} from 'class-validator';
import { GenderType, Role } from 'generated/prisma/enums';

import { IsValidPassword } from 'src/common/validators/is-valid-password.decorator';

/**
 * POST /auth/signup
 *
 * Profile fields (patient/doctor) belong on POST /patients or POST /doctors
 * after login. Do not send them here.
 */
export class SignupDto {
  @IsString()
  @MinLength(3)
  username: string;

  @IsEmail()
  email: string;

  @IsEnum(GenderType)
  gender: GenderType;

  @IsEnum(Role)
  role: Role;

  @IsString()
  city: string;

  @IsString()
  country: string;

  @IsValidPassword()
  password: string;

  @IsString()
  @IsOptional()
  photo?: string;

  @IsString()
  timezone: string;

  @IsString()
  @IsOptional()
  phone?: string;
}
