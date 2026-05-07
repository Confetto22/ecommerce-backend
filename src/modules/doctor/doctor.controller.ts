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
  Put,
  Query,
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
import { ReplaceAvailabilityDto } from '../availability/dto/replace-availability.dto';
import { AvailabilityService } from '../availability/availability.service';
import { Public } from 'src/common/decorators/public.decorator';
import { ListDoctorsQueryDto } from './dto/list-doctors-query.dto';
import { AvailabilityQueryDto } from '../availability/dto/availability-query.dto';

@Controller('doctors')
export class DoctorController {
  constructor(
    private readonly doctorService: DoctorService,
    private readonly availabilityService: AvailabilityService,
  ) {}

  /**
   * Onboard a doctor profile for the authenticated user.
   * The user must already exist (JWT) and have signed up with role DOCTOR.
   */
  @Post()
  @UseGuards(JwtAuthGuard)
  create(@CurrentUser() user: User, @Body() createDoctorDto: CreateDoctorDto) {
    return this.doctorService.createForUser(user, createDoctorDto);
  }

  @Get()
  @Public()
  async listDoctors(@Query() query: ListDoctorsQueryDto) {
    return this.doctorService.listDoctors(query);
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

  // 4. GET /doctors/:id/availability — public slot calendar (NEW)
  @Get(':id/availability')
  @Public()
  async getAvailability(
    @Param('id') doctorId: string,
    @Query() query: AvailabilityQueryDto,
  ) {
    return this.doctorService.getAvailabilityForPublic(doctorId, query);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('DOCTOR')
  @Put('me/availability')
  async replaceAvailability(
    @CurrentUser() user: User,
    @Body() dto: ReplaceAvailabilityDto,
  ) {
    await this.availabilityService.replaceRules(user, dto);
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
