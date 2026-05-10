import { AppointmentStatus, Role, Prisma } from 'generated/prisma/client';
import { findTransition, TransitionActor } from './transitions';
import { ConflictException } from '@nestjs/common';

export interface TransitionInput {
  appointmentId: string;
  fromStatus: AppointmentStatus;
  toStatus: AppointmentStatus;
  actorUserId: string;
  actorRole: Role | 'SYSTEM';
  reason?: string;
  metadata?: Record<string, unknown>;
}

export class AppointmentStateMachine {
  /**
   * Validates the transition then writes the AppointmentLog. Must be called
   * inside a Prisma transaction (`tx`) so that the log and the actual
   * status update commit atomically.
   *
   * Throws `ConflictException` with `error: 'INVALID_TRANSITION'` for any
   * pair that is not in the table.
   */

  async assertAndLog(
    tx: Prisma.TransactionClient,
    input: TransitionInput,
  ): Promise<void> {
    const actor: TransitionActor =
      input.actorRole === 'SYSTEM'
        ? 'SYSTEM'
        : (input.actorRole as TransitionActor);
    const spec = findTransition(input.fromStatus, input.toStatus, actor);
    if (!spec) {
      throw new ConflictException({
        message: `Cannot transition from ${input.fromStatus} to ${input.toStatus} as ${actor}`,
        error: 'INVALID_TRANSITION',
      });
    }
    await tx.appointmentLog.create({
      data: {
        appointmentId: input.appointmentId,
        previousStatus: input.fromStatus,
        newStatus: input.toStatus,
        changedBy: input.actorUserId,
        reason: input.reason ?? null,
        //   metadata: (input.metadata ?? null) as Prisma.InputJsonValue | null,
        metadata: (input.metadata ?? null) as Prisma.InputJsonValue,
      },
    });
  }
}
