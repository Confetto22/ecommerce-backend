import { IsString } from 'class-validator';

export class CreatePatientDto {
  @IsString()
  userId: string;
}
