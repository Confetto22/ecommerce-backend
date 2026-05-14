import { Module } from '@nestjs/common';
import { AppointmentService } from './appointment.service';
import { BookingService } from './booking.service';
import { AppointmentController } from './appointment.controller';
import { PrismaModule } from 'src/infrastructure/database/prisma.module';
import { AppointmentStateMachine } from './state-machine/appointment-state-machine';
import { AvailabilityModule } from '../availability/availability.module';

@Module({
  imports: [PrismaModule, AvailabilityModule],
  controllers: [AppointmentController],
  providers: [AppointmentService, BookingService, AppointmentStateMachine],
  exports: [AppointmentService, BookingService], // M5/M6 may import these
})
export class AppointmentModule {}
