import { IsString, IsNotEmpty, MaxLength } from 'class-validator';

export class RejectAppointmentDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  reason: string;
}
