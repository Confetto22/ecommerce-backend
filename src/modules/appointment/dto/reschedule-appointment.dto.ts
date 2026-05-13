import { IsDateString, IsNotEmpty } from 'class-validator';

export class RescheduleAppointmentDto {
  @IsDateString()
  @IsNotEmpty()
  proposedStartAt: string;

  @IsDateString()
  @IsNotEmpty()
  proposedEndAt: string;
}
