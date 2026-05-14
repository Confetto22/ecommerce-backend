import {
  Allow,
  ArrayMaxSize,
  IsArray,
  IsEnum,
  IsISO8601,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUrl,
  IsUUID,
  MaxLength,
} from 'class-validator';
import { AppointmentType } from 'generated/prisma/client';

export class CreateAppointmentDto {
  @IsUUID()
  doctorId: string;

  @IsISO8601({ strict: true })
  scheduledStartAt: string;

  @IsISO8601({ strict: true })
  scheduledEndAt: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  conditionTitle: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(2000)
  context: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(6)
  @IsUrl({}, { each: true })
  images?: string[];

  @IsOptional()
  @IsEnum(AppointmentType)
  type?: AppointmentType;

  /**
   * Set by the controller from the `Idempotency-Key` header before calling
   * the booking service. Not sent (or trusted) from the JSON body.
   */
  @Allow()
  @IsOptional()
  @IsString()
  @MaxLength(100)
  idempotencyKey?: string;
}
