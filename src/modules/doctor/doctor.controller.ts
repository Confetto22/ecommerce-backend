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
import { DoctorService } from './doctor.service';
import { CreateDoctorDto } from './dto/create-doctor.dto';
import { UpdateDoctorDto } from './dto/update-doctor.dto';
import { JwtAuthGuard } from 'src/common/guards/jwt-auth.guard';
import { CurrentUser } from 'src/common/decorators/current-user.decorator';
import { User } from '../user/entities/user.entity';
import { DoctorProfile } from './entities/doctor-profile.entity';
import { RolesGuard } from 'src/common/guards/roles.guard';
import { Roles } from 'src/common/decorators/roles.decorator';

@Controller('doctors')
export class DoctorController {
  constructor(private readonly doctorService: DoctorService) {}

  /**
   * Onboard a doctor profile for the authenticated user.
   * The user must already exist (JWT) and have signed up with role DOCTOR.
   */
  @Post()
  @UseGuards(JwtAuthGuard)
  create(
    @CurrentUser() user: User,
    @Body() createDoctorDto: CreateDoctorDto,
  ) {
    return this.doctorService.createForUser(user, createDoctorDto);
  }

  @Get()
  findAllDoctors() {
    return this.doctorService.findAllDoctors();
  }

  @Get('me')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('DOCTOR')
  async getSelf(@CurrentUser() user: User): Promise<DoctorProfile> {
    return await this.doctorService.getSelf(user.id);
  }

  @Get(':id')
  async getPublicProfile(@Param('id') id: string): Promise<DoctorProfile> {
    return await this.doctorService.getPublicProfile(id);
  }

  @Patch('me')
  async updateMyProfile(
    @CurrentUser() user: User,
    @Body() updateDoctorDto: UpdateDoctorDto,
  ): Promise<{ message: string }> {
    return await this.doctorService.updateMyProfile(user.id, updateDoctorDto);
  }

  @Delete('me')
  async deleteDoctor(
    @CurrentUser() user: User,
    @Res({ passthrough: true }) res: Response,
  ): Promise<{ message: string }> {
    return await this.doctorService.deleteDoctor(user.id, res);
  }
}
