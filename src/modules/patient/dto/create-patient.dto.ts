import { Type } from 'class-transformer';
import { IsArray, IsDate, IsOptional, IsString } from 'class-validator';

export class CreatePatientDto {
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
