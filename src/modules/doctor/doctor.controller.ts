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
  create(@CurrentUser() user: User, @Body() createDoctorDto: CreateDoctorDto) {
    return this.doctorService.createForUser(user, createDoctorDto);
  }

  // @Get()
  // findAll() {
  //   return this.doctorService.findAll();
  // }

  // @Get(':id')
  // findOne(@Param('id') id: string) {
  //   return this.doctorService.findOne(+id);
  // }
  @Get('me')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('DOCTOR')
  async getCurrentDoctorProfile(
    @CurrentUser() user: User,
  ): Promise<DoctorProfile> {
    return await this.doctorService.getCurrentDoctorProfile(user.id);
  }

  // @Patch(':id')
  // update(@Param('id') id: string, @Body() updateDoctorDto: UpdateDoctorDto) {
  //   return this.doctorService.update(+id, updateDoctorDto);
  // }

  // @Delete(':id')
  // remove(@Param('id') id: string) {
  //   return this.doctorService.remove(+id);
  // }
}
