import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  UseGuards,
} from '@nestjs/common';
import { PatientService } from './patient.service';
import { CreatePatientDto } from './dto/create-patient.dto';
import { UpdatePatientDto } from './dto/update-patient.dto';
import { JwtAuthGuard } from 'src/common/guards/jwt-auth.guard';
import { CurrentUser } from 'src/common/decorators/current-user.decorator';
import { User } from '../user/entities/user.entity';
import { PatientProfile } from './entities/patient-profile.entity';
import { RolesGuard } from 'src/common/guards/roles.guard';
import { Roles } from 'src/common/decorators/roles.decorator';

@Controller('patients')
export class PatientController {
  constructor(private readonly patientService: PatientService) {}

  /**
   * Onboard a patient profile for the authenticated user.
   * The user must already exist (JWT) and have signed up with role PATIENT.
   */
  @Post()
  @UseGuards(JwtAuthGuard)
  async createPatient(
    @CurrentUser() user: User,
    @Body() createPatientDto: CreatePatientDto,
  ) {
    return await this.patientService.createForUser(user, createPatientDto);
  }

  @Get()
  async findAllPatients() {
    return await this.patientService.findAllPatients();
  }

  @Get('me')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('PATIENT')
  async getCurrentPatient(@CurrentUser() user: User): Promise<PatientProfile> {
    return await this.patientService.getCurrentPatient(user.id);
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
