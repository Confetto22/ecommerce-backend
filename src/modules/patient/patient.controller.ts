import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Delete,
  UseGuards,
  Res,
  Param,
} from '@nestjs/common';
import type { Response } from 'express';
import { PatientService } from './patient.service';
import { CreatePatientDto } from './dto/create-patient.dto';
import { UpdatePatientDto } from './dto/update-patient.dto';
import { JwtAuthGuard } from 'src/common/guards/jwt-auth.guard';
import { CurrentUser } from 'src/common/decorators/current-user.decorator';
import { User } from '../user/entities/user.entity';
import { PatientProfile } from './entities/patient-profile.entity';
import { RolesGuard } from 'src/common/guards/roles.guard';
import { Roles } from 'src/common/decorators/roles.decorator';
import { Public } from 'src/common/decorators/public.decorator';

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
  async getSelf(@CurrentUser() user: User): Promise<PatientProfile> {
    return await this.patientService.getSelf(user.id);
  }

  @Get('/:id')
  async getPublicProfile(@Param('id') id: string): Promise<PatientProfile> {
    return await this.patientService.getPublicProfile(id);
  }

  @Patch('me')
  async updateMyProfile(
    @CurrentUser() user: User,

    @Body() updatePatientDto: UpdatePatientDto,
  ): Promise<{ message: string }> {
    return await this.patientService.updateMyProfile(user.id, updatePatientDto);
  }

  @Delete('me')
  async deletePatient(
    @CurrentUser() user: User,
    @Res({ passthrough: true }) res: Response,
  ): Promise<{ message: string }> {
    return await this.patientService.deletePatient(user.id, res);
  }
}
