import { IsEmail, IsEnum, IsString, MinLength } from 'class-validator';
import { GenderType, Role } from 'generated/prisma/enums';

import { IsValidPassword } from 'src/common/validators/is-valid-password.decorator';

/**
 * Internal user-create shape. Mirrors the Prisma `User` model. Public
 * signup uses `SignupDto` instead — this lives here for any future admin
 * flow that needs to provision users directly.
 */
export class CreateUserDto {
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
  phone: string;

  @IsString()
  timezone: string;

  @IsString()
  photo: string;
}
