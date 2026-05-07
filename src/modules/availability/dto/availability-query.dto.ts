import { IsISO8601, IsNotEmpty } from 'class-validator';

export class AvailabilityQueryDto {
  @IsNotEmpty()
  @IsISO8601()
  from: string;

  @IsNotEmpty()
  @IsISO8601()
  to: string;
}
