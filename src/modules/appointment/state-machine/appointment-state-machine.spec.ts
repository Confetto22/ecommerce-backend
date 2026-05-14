import { ConflictException } from '@nestjs/common';
import { AppointmentStateMachine } from './appointment-state-machine';
import { AppointmentStatus } from 'generated/prisma/client';

// ──────────────────────────────────────────────────────────────────────────────
// Fixtures
// ──────────────────────────────────────────────────────────────────────────────

const ALL_STATUSES: AppointmentStatus[] = [
  'PENDING',
  'APPROVED',
  'RESCHEDULED',
  'IN_SESSION',
  'COMPLETED',
  'CANCELLED',
  'NO_SHOW',
];

interface MockTx {
  appointmentLog: {
    create: jest.Mock;
  };
}

function makeMockTx(): MockTx {
  return {
    appointmentLog: {
      create: jest.fn().mockResolvedValue({ id: 'log-1' }),
    },
  };
}

// ──────────────────────────────────────────────────────────────────────────────
// Legal transitions — mirrors transitions.ts exactly
// ──────────────────────────────────────────────────────────────────────────────

const LEGAL: Array<{
  from: AppointmentStatus;
  to: AppointmentStatus;
  actor: 'PATIENT' | 'DOCTOR' | 'SYSTEM';
  name: string;
}> = [
  { from: 'PENDING', to: 'APPROVED', actor: 'DOCTOR', name: 'approve' },
  { from: 'PENDING', to: 'CANCELLED', actor: 'DOCTOR', name: 'reject' },
  {
    from: 'PENDING',
    to: 'CANCELLED',
    actor: 'PATIENT',
    name: 'cancel.byPatient',
  },
  {
    from: 'PENDING',
    to: 'RESCHEDULED',
    actor: 'DOCTOR',
    name: 'propose.byDoctor',
  },
  {
    from: 'APPROVED',
    to: 'RESCHEDULED',
    actor: 'DOCTOR',
    name: 'propose.byDoctor',
  },
  { from: 'APPROVED', to: 'CANCELLED', actor: 'DOCTOR', name: 'cancel' },
  { from: 'APPROVED', to: 'CANCELLED', actor: 'PATIENT', name: 'cancel' },
  {
    from: 'RESCHEDULED',
    to: 'APPROVED',
    actor: 'PATIENT',
    name: 'accept.proposal',
  },
  {
    from: 'RESCHEDULED',
    to: 'RESCHEDULED',
    actor: 'PATIENT',
    name: 'counter.proposal',
  },
  {
    from: 'RESCHEDULED',
    to: 'CANCELLED',
    actor: 'DOCTOR',
    name: 'cancel',
  },
  {
    from: 'RESCHEDULED',
    to: 'CANCELLED',
    actor: 'PATIENT',
    name: 'cancel',
  },
  {
    from: 'APPROVED',
    to: 'IN_SESSION',
    actor: 'DOCTOR',
    name: 'session.start',
  },
  {
    from: 'IN_SESSION',
    to: 'COMPLETED',
    actor: 'DOCTOR',
    name: 'session.complete',
  },
  {
    from: 'APPROVED',
    to: 'NO_SHOW',
    actor: 'DOCTOR',
    name: 'noshow.markedManual',
  },
  {
    from: 'APPROVED',
    to: 'NO_SHOW',
    actor: 'SYSTEM',
    name: 'noshow.markedManual',
  },
  {
    from: 'IN_SESSION',
    to: 'NO_SHOW',
    actor: 'SYSTEM',
    name: 'noshow.auto',
  },
];

// ──────────────────────────────────────────────────────────────────────────────
// Tests
// ──────────────────────────────────────────────────────────────────────────────

describe('AppointmentStateMachine', () => {
  let sm: AppointmentStateMachine;

  beforeEach(() => {
    sm = new AppointmentStateMachine();
  });

  // ──────────────────────────────────────────────────────────────────────────
  // Legal transitions
  // ──────────────────────────────────────────────────────────────────────────

  describe('legal transitions', () => {
    it.each(LEGAL)(
      '$from → $to as $actor ($name) is allowed and writes a log row',
      async ({ from, to, actor }) => {
        const tx = makeMockTx();

        await sm.assertAndLog(tx as any, {
          appointmentId: 'a-1',
          fromStatus: from,
          toStatus: to,
          actorUserId: 'u-1',
          actorRole: actor === 'SYSTEM' ? 'SYSTEM' : actor,
          reason: 'unit test',
          metadata: { test: true },
        });

        expect(tx.appointmentLog.create).toHaveBeenCalledTimes(1);
        expect(tx.appointmentLog.create).toHaveBeenCalledWith(
          expect.objectContaining({
            data: expect.objectContaining({
              previousStatus: from,
              newStatus: to,
              changedBy: 'u-1',
              reason: 'unit test',
            }),
          }),
        );
      },
    );
  });

  // ──────────────────────────────────────────────────────────────────────────
  // Illegal transitions
  // ──────────────────────────────────────────────────────────────────────────

  describe('illegal transitions', () => {
    // Generate every (from, to, actor) combo that is NOT in LEGAL.
    const ALL_ACTORS: Array<'PATIENT' | 'DOCTOR' | 'SYSTEM'> = [
      'PATIENT',
      'DOCTOR',
      'SYSTEM',
    ];
    const ILLEGAL: Array<{
      from: AppointmentStatus;
      to: AppointmentStatus;
      actor: (typeof ALL_ACTORS)[number];
    }> = [];

    for (const from of ALL_STATUSES) {
      for (const to of ALL_STATUSES) {
        // Skip self-loops except RESCHEDULED→RESCHEDULED (the only legal one)
        if (from === to && from !== 'RESCHEDULED') continue;
        for (const actor of ALL_ACTORS) {
          const isLegal = LEGAL.some(
            (l) => l.from === from && l.to === to && l.actor === actor,
          );
          if (!isLegal) ILLEGAL.push({ from, to, actor });
        }
      }
    }

    it.each(ILLEGAL)(
      '$from → $to as $actor is rejected with INVALID_TRANSITION',
      async ({ from, to, actor }) => {
        const tx = makeMockTx();

        await expect(
          sm.assertAndLog(tx as any, {
            appointmentId: 'a-1',
            fromStatus: from,
            toStatus: to,
            actorUserId: 'u-1',
            actorRole: actor === 'SYSTEM' ? 'SYSTEM' : actor,
          }),
        ).rejects.toThrow(ConflictException);

        expect(tx.appointmentLog.create).not.toHaveBeenCalled();
      },
    );
  });

  // ──────────────────────────────────────────────────────────────────────────
  // Terminal states — no outgoing edges
  // ──────────────────────────────────────────────────────────────────────────

  describe('terminal states', () => {
    it.each(['COMPLETED', 'CANCELLED', 'NO_SHOW'] as const)(
      '%s has no outgoing transitions',
      async (terminal) => {
        const tx = makeMockTx();
        for (const to of ALL_STATUSES) {
          if (to === terminal) continue;
          for (const actor of ['PATIENT', 'DOCTOR', 'SYSTEM'] as const) {
            await expect(
              sm.assertAndLog(tx as any, {
                appointmentId: 'a-1',
                fromStatus: terminal,
                toStatus: to,
                actorUserId: 'u-1',
                actorRole: actor === 'SYSTEM' ? 'SYSTEM' : actor,
              }),
            ).rejects.toThrow(ConflictException);
          }
        }
      },
    );
  });

  // ──────────────────────────────────────────────────────────────────────────
  // Metadata propagation
  // ──────────────────────────────────────────────────────────────────────────

  describe('metadata propagation', () => {
    it('passes metadata through to the log entry', async () => {
      const tx = makeMockTx();
      const metadata = {
        proposedStartAt: '2026-06-08T10:00:00Z',
        proposedEndAt: '2026-06-08T11:00:00Z',
      };

      await sm.assertAndLog(tx as any, {
        appointmentId: 'a-1',
        fromStatus: 'PENDING',
        toStatus: 'RESCHEDULED',
        actorUserId: 'u-1',
        actorRole: 'DOCTOR',
        metadata,
      });

      expect(tx.appointmentLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            metadata,
          }),
        }),
      );
    });

    it('stores null metadata when none is provided', async () => {
      const tx = makeMockTx();

      await sm.assertAndLog(tx as any, {
        appointmentId: 'a-1',
        fromStatus: 'PENDING',
        toStatus: 'APPROVED',
        actorUserId: 'u-1',
        actorRole: 'DOCTOR',
      });

      expect(tx.appointmentLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            metadata: null,
          }),
        }),
      );
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // Wrong actor scenarios
  // ──────────────────────────────────────────────────────────────────────────

  describe('wrong actor', () => {
    it('PATIENT cannot approve (doctor-only transition)', async () => {
      const tx = makeMockTx();

      await expect(
        sm.assertAndLog(tx as any, {
          appointmentId: 'a-1',
          fromStatus: 'PENDING',
          toStatus: 'APPROVED',
          actorUserId: 'u-1',
          actorRole: 'PATIENT',
        }),
      ).rejects.toThrow(ConflictException);

      expect(tx.appointmentLog.create).not.toHaveBeenCalled();
    });

    it('DOCTOR cannot accept a proposal (patient-only transition)', async () => {
      const tx = makeMockTx();

      await expect(
        sm.assertAndLog(tx as any, {
          appointmentId: 'a-1',
          fromStatus: 'RESCHEDULED',
          toStatus: 'APPROVED',
          actorUserId: 'u-1',
          actorRole: 'DOCTOR',
        }),
      ).rejects.toThrow(ConflictException);

      expect(tx.appointmentLog.create).not.toHaveBeenCalled();
    });

    it('PATIENT cannot start a session (doctor-only M6 transition)', async () => {
      const tx = makeMockTx();

      await expect(
        sm.assertAndLog(tx as any, {
          appointmentId: 'a-1',
          fromStatus: 'APPROVED',
          toStatus: 'IN_SESSION',
          actorUserId: 'u-1',
          actorRole: 'PATIENT',
        }),
      ).rejects.toThrow(ConflictException);

      expect(tx.appointmentLog.create).not.toHaveBeenCalled();
    });
  });
});
