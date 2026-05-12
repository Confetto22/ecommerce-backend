import {
  Body,
  Controller,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import { AppointmentService } from './appointment.service';
import { CurrentUser } from 'src/common/decorators/current-user.decorator';
import { Roles } from 'src/common/decorators/roles.decorator';
import { User } from '../user/entities/user.entity';
import { RejectAppointmentDto } from './dto/reject-appointment.dto';
import { CancelAppointmentDto } from './dto/cancel-appointment.dto';
import { RescheduleAppointmentDto } from './dto/reschedule-appointment.dto';
import { RespondToRescheduleDto } from './dto/respond-to-reschedule.dto';

@Controller('appointments')
export class AppointmentController {
  constructor(private readonly appointmentService: AppointmentService) {}

  /**
   * PENDING → APPROVED (DOCTOR only)
   */
  @Post(':id/approve')
  @Roles('DOCTOR')
  approve(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: User,
  ) {
    return this.appointmentService.approve(id, user);
  }

  /**
   * PENDING → CANCELLED with reason (DOCTOR only, semantic "rejection")
   */
  @Post(':id/reject')
  @Roles('DOCTOR')
  reject(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: User,
    @Body() dto: RejectAppointmentDto,
  ) {
    return this.appointmentService.reject(id, user, dto);
  }

  /**
   * PENDING | APPROVED → RESCHEDULED (DOCTOR only, proposes new time)
   */
  @Post(':id/reschedule')
  @Roles('DOCTOR')
  reschedule(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: User,
    @Body() dto: RescheduleAppointmentDto,
  ) {
    return this.appointmentService.reschedule(id, user, dto);
  }

  /**
   * RESCHEDULED → APPROVED | RESCHEDULED | CANCELLED (PATIENT only)
   */
  @Post(':id/respond-to-reschedule')
  @Roles('PATIENT')
  respondToReschedule(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: User,
    @Body() dto: RespondToRescheduleDto,
  ) {
    return this.appointmentService.respondToReschedule(id, user, dto);
  }

  /**
   * PENDING | APPROVED | RESCHEDULED → CANCELLED (either party)
   */
  @Post(':id/cancel')
  cancel(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: User,
    @Body() dto: CancelAppointmentDto,
  ) {
    return this.appointmentService.cancel(id, user, dto);
  }
}
