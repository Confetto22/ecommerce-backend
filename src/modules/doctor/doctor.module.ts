import { Module } from '@nestjs/common';
import { DoctorService } from './doctor.service';
import { DoctorController } from './doctor.controller';
import { AuthModule } from '../auth/auth.module';
import { AvailabilityService } from '../availability/availability.service';

@Module({
  imports: [AuthModule],
  controllers: [DoctorController],
  providers: [DoctorService, AvailabilityService],
})
export class DoctorModule {}
