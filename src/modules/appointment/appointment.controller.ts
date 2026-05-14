import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import { AppointmentService } from './appointment.service';
import { BookingService } from './booking.service';
import { CurrentUser } from 'src/common/decorators/current-user.decorator';
import { Roles } from 'src/common/decorators/roles.decorator';
import { User } from '../user/entities/user.entity';
import { CreateAppointmentDto } from './dto/create-appointment.dto';
import { RejectAppointmentDto } from './dto/reject-appointment.dto';
import { CancelAppointmentDto } from './dto/cancel-appointment.dto';
import { RescheduleAppointmentDto } from './dto/reschedule-appointment.dto';
import { RespondToRescheduleDto } from './dto/respond-to-reschedule.dto';
import { ListAppointmentsQueryDto } from './dto/list-appointments-query.dto';

/**
 * Route ordering matters in NestJS — static segments must come BEFORE
 * parameterized ones so that `:id` doesn't swallow `/me` and `/inbox`.
 * See 05d §14.
 */
@Controller('appointments')
export class AppointmentController {
  constructor(
    private readonly appointmentService: AppointmentService,
    private readonly bookingService: BookingService,
  ) {}

  // ──────────────────────────────────────────────────────────────────────────
  // 1. Static collection routes (must come before :id params)
  // ──────────────────────────────────────────────────────────────────────────

  /**
   * POST /appointments — create a new booking.
   * Requires `Idempotency-Key` header (opaque string, up to 100 chars).
   * PATIENT only.
   */
  @Post()
  @Roles('PATIENT')
  @HttpCode(HttpStatus.CREATED)
  create(
    @CurrentUser() user: User,
    @Body() dto: CreateAppointmentDto,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    if (!idempotencyKey || idempotencyKey.trim().length === 0) {
      throw new BadRequestException({
        error: 'MISSING_IDEMPOTENCY_KEY',
        message: 'The Idempotency-Key header is required',
      });
    }
    if (idempotencyKey.length > 100) {
      throw new BadRequestException({
        error: 'MISSING_IDEMPOTENCY_KEY',
        message: 'Idempotency-Key must be at most 100 characters',
      });
    }

    // Inject the header value into the DTO so the service doesn't
    // need to know about HTTP headers.
    dto.idempotencyKey = idempotencyKey.trim();

    return this.bookingService.create(user, dto);
  }

  /**
   * GET /appointments/me — patient's own appointment list.
   * Filterable by status, date range. Paginated.
   */
  @Get('me')
  @Roles('PATIENT')
  listMine(
    @CurrentUser() user: User,
    @Query() query: ListAppointmentsQueryDto,
  ) {
    return this.appointmentService.listForPatient(user, query);
  }

  /**
   * GET /appointments/inbox — doctor's inbox.
   * Pending first, filterable by status, date range. Paginated.
   */
  @Get('inbox')
  @Roles('DOCTOR')
  listInbox(
    @CurrentUser() user: User,
    @Query() query: ListAppointmentsQueryDto,
  ) {
    return this.appointmentService.listForDoctor(user, query);
  }

  // ──────────────────────────────────────────────────────────────────────────
  // 2. Parameterized routes (must come after static collection routes)
  // ──────────────────────────────────────────────────────────────────────────

  /**
   * GET /appointments/:id — detail with log timeline.
   * Both participants can view.
   */
  @Get(':id')
  @Roles('PATIENT', 'DOCTOR')
  getOne(
    @CurrentUser() user: User,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.appointmentService.findById(user, id);
  }

  /**
   * PENDING → APPROVED (DOCTOR only)
   */
  @Post(':id/approve')
  @Roles('DOCTOR')
  approve(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: User) {
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
