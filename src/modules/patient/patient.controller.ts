import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
} from '@nestjs/common';
import { PatientService } from './patient.service';
import { CreatePatientDto } from './dto/create-patient.dto';
import { UpdatePatientDto } from './dto/update-patient.dto';

@Controller('patients')
export class PatientController {
  constructor(private readonly patientService: PatientService) {}

  @Post()
  async createPatient(@Body() createPatientDto: CreatePatientDto) {
    return await this.patientService.createPatient(createPatientDto);
  }

  @Get()
  async findAllPatients() {
    return await this.patientService.findAllPatients();
  }

  @Get('/:id')
  async findPatient(@Param('id') id: string) {
    return await this.patientService.findPatient(id);
  }

  @Patch('/:id')
  async updatePatient(
    @Param('id') id: string,
    @Body() updatePatientDto: UpdatePatientDto,
  ) {
    return await this.patientService.updatePatient(id, updatePatientDto);
  }

  @Delete('/:id')
  async deletePatient(@Param('id') id: string) {
    await this.patientService.deletePatient(id);
  }
}
