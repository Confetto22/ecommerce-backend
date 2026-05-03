import { PartialType } from '@nestjs/mapped-types';
import { PatientUserDto } from './full-patient-user.dto';

export class UpdatePatientDto extends PartialType(PatientUserDto) {}
