import { Type } from 'class-transformer';
import {
  IsArray,
  IsDate,
  IsEmail,
  IsEnum,
  IsOptional,
  IsString,
  MinLength,
} from 'class-validator';
import { GenderType, Role } from 'generated/prisma/enums';
import { IsValidPassword } from 'src/common/validators/is-valid-password.decorator';

export class PatientUserDto {
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
  @Type(() => Date)
  @IsDate()
  dateOfBirth: Date;

  @IsOptional()
  @IsString()
  bloodType?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  allergies?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  medicalConditions?: string[];

  @IsOptional()
  @IsString()
  emergencyContactPhone?: string;

  @IsOptional()
  @IsString()
  emergencyContactName?: string;
}
