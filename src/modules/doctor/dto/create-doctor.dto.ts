import { consultationTypes } from 'generated/prisma/enums';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';

export class CreateDoctorDto {
  @IsInt()
  @Min(0)
  yearsOfExperience: number;

  @IsString()
  educationLevel: string;

  @IsString()
  institution: string;

  @IsInt()
  @Min(0)
  perHourRate: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(24 * 60)
  appointmentSlotMinutes?: number;

  @IsOptional()
  @IsString()
  bio?: string;

  @IsBoolean()
  published: boolean = false;

  @IsArray()
  @IsOptional()
  @ArrayMinSize(1)
  @ArrayMaxSize(6)
  // @IsIn(SPECIALTIES, { each: true })
  specialties?: string[];

  @IsArray()
  @IsOptional()
  languages?: string[];

  @IsEnum(consultationTypes)
  modeOfConsultation: consultationTypes;

  // @IsOptional()
  // @IsInt()
  // @Min(0)
  // totalRatings?: number;

  // @IsOptional()
  // @IsNumber()
  // averageRating?: number;
}
