import { AppointmentStatus, Role } from 'generated/prisma/client';

/**
 * The actor for a transition. PATIENT and DOCTOR map to roles; SYSTEM is
 * reserved for scheduled jobs (e.g. auto NO_SHOW).
 */
export type TransitionActor = 'PATIENT' | 'DOCTOR' | 'SYSTEM';

export interface TransitionSpec {
  from: AppointmentStatus;
  to: AppointmentStatus;
  actors: ReadonlyArray<TransitionActor>;
  /** Internal label for logs / metrics. */
  name: string;
}

/**
 * The single source of truth for legal status changes. Order is irrelevant;
 * lookups are O(n) over a tiny array, which is plenty fast.
 */

export const TRANSITIONS: ReadonlyArray<TransitionSpec> = [
  { from: 'PENDING', to: 'APPROVED', actors: ['DOCTOR'], name: 'approve' },
  { from: 'PENDING', to: 'CANCELLED', actors: ['DOCTOR'], name: 'reject' },
  {
    from: 'PENDING',
    to: 'CANCELLED',
    actors: ['PATIENT'],
    name: 'cancel.byPatient',
  },
  {
    from: 'PENDING',
    to: 'RESCHEDULED',
    actors: ['DOCTOR'],
    name: 'propose.byDoctor',
  },
  {
    from: 'APPROVED',
    to: 'RESCHEDULED',
    actors: ['DOCTOR'],
    name: 'propose.byDoctor',
  },
  {
    from: 'APPROVED',
    to: 'CANCELLED',
    actors: ['DOCTOR', 'PATIENT'],
    name: 'cancel',
  },
  {
    from: 'RESCHEDULED',
    to: 'APPROVED',
    actors: ['PATIENT'],
    name: 'accept.proposal',
  },
  {
    from: 'RESCHEDULED',
    to: 'RESCHEDULED',
    actors: ['PATIENT'],
    name: 'counter.proposal',
  },
  {
    from: 'RESCHEDULED',
    to: 'CANCELLED',
    actors: ['DOCTOR', 'PATIENT'],
    name: 'cancel',
  },

  // ── M6 transitions (state machine accepts them, endpoints land in M6) ──
  {
    from: 'APPROVED',
    to: 'IN_SESSION',
    actors: ['DOCTOR'],
    name: 'session.start',
  },
  {
    from: 'IN_SESSION',
    to: 'COMPLETED',
    actors: ['DOCTOR'],
    name: 'session.complete',
  },
  {
    from: 'APPROVED',
    to: 'NO_SHOW',
    actors: ['DOCTOR', 'SYSTEM'],
    name: 'noshow.markedManual',
  },
  {
    from: 'IN_SESSION',
    to: 'NO_SHOW',
    actors: ['SYSTEM'],
    name: 'noshow.auto',
  },
] as const;

/** Quick lookup: is this transition declared at all? */
export function findTransition(
  from: AppointmentStatus,
  to: AppointmentStatus,
  actor: TransitionActor,
): TransitionSpec | undefined {
  return TRANSITIONS.find(
    (t) => t.from === from && t.to === to && t.actors.includes(actor),
  );
}

export const TERMINAL_STATUSES: ReadonlyArray<AppointmentStatus> = [
  'COMPLETED',
  'CANCELLED',
  'NO_SHOW',
];

export function isTerminal(status: AppointmentStatus): boolean {
  return TERMINAL_STATUSES.includes(status);
}
