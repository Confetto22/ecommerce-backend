/** A UTC time interval — both inclusive start, exclusive end. */
export interface Interval {
  start: Date; // UTC
  end: Date; // UTC
}

/** A single bookable slot returned by the solver. */
export interface Slot {
  startAt: Date; // UTC
  endAt: Date; // UTC
}

/** One bookable slot; UTC fields are canonical. */
export interface EnrichedSlot extends Slot {
  /** Present only when `viewerTimezone` was supplied to the solver wrapper. */
  viewerLocalStartAt?: string;
  viewerLocalEndAt?: string;
}

/** Full solver output. */
export interface SlotResult {
  doctorId: string;
  /** Doctor’s IANA working timezone (same as `User.timezone`). */
  doctorTimezone: string;
  slotMinutes: number;
  /** Echo of request hint when provided (omit if absent). */
  viewerTimezone?: string;
  slots: EnrichedSlot[];
}
