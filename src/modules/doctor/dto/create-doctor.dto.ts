import { consultationTypes } from 'generated/prisma/enums';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
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

  @IsOptional()
  @IsBoolean()
  published?: boolean;

  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(6)
  @IsString({ each: true })
  specialties?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
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
