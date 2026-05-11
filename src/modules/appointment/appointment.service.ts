import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { User } from '../user/entities/user.entity';
import { PrismaService } from 'src/infrastructure/database/prisma.service';
import { AppointmentStateMachine } from './state-machine/appointment-state-machine';

@Injectable()
export class AppointmentService {
  constructor(
    private readonly db: PrismaService,
    private stateMachine: AppointmentStateMachine,
  ) {}
  async approve(appointmentId: string, doctorUser: User) {
    return this.db.$transaction(async (tx) => {
      const appt = await tx.appointment.findUnique({
        where: { id: appointmentId },
      });
      if (!appt) throw new NotFoundException('APPOINTMENT_NOT_FOUND');

      // await this.assertDoctorOwns(appt, doctorUser);

      // 1. Ask the state machine FIRST. Throws if illegal.
      await this.stateMachine.assertAndLog(tx, {
        appointmentId: appt.id,
        fromStatus: appt.status,
        toStatus: 'APPROVED',
        actorUserId: doctorUser.id,
        actorRole: 'DOCTOR',
        metadata: {},
      });

      // 2. Apply the actual update. Idempotent against the prior status check.
      const result = await tx.appointment.updateMany({
        where: { id: appt.id, status: 'PENDING' }, // ← guard
        data: { status: 'APPROVED' },
      });
      if (result.count === 0) {
        throw new ConflictException({
          message: 'Appointment status changed concurrently. Reload and retry.',
          error: 'INVALID_TRANSITION',
        });
      }

      return result;
    });
    //   .then((result) => {
    //     // 3. Post-commit side effects.
    //     this.events.emit(APPOINTMENT_APPROVED, { appointmentId: updated.id });
    //     void this.availability.invalidateCache(updated.doctorId);
    //     void this.availability.recomputeNextAvailable(updated.doctorId);
    //     return this.toResponse(updated);
    //   });
  }
}
