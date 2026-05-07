import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsDate,
  IsEnum,
  IsOptional,
  IsString,
  Max,
  Min,
  ValidateIf,
} from 'class-validator';
import { AvailabilityKind } from 'generated/prisma/enums';

export class CreateAvailabilityRuleDto {
  // Each rule:

  @IsOptional()
  @IsString()
  doctorId?: string;

  @IsString()
  @IsEnum(AvailabilityKind)
  kind: AvailabilityKind; // RECURRING | OVERRIDE | BLACKOUT

  @IsOptional()
  @Min(0)
  @Max(6)
  weekday?: number; // 0-6, required if RECURRING

  @IsOptional()
  @Type(() => Date)
  date?: Date; // ISO date, required if OVERRIDE/BLACKOUT

  @IsString()
  startTime: string; // "HH:mm"
  @IsString()
  endTime: string; // "HH:mm"

  @IsOptional()
  @IsBoolean()
  isActive?: boolean; // default true
}
