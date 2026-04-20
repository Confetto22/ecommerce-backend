import type { JobsOptions } from 'bullmq';

/**
 * Defaults applied to every job unless a caller overrides them at enqueue time.
 * BullMQ does not support a queue-level `timeout`; per-job timeout must be set
 * by the caller inside `queue.add(name, data, { ...DEFAULT_JOB_OPTIONS, timeout })`.
 */
export const DEFAULT_JOB_OPTIONS: JobsOptions = {
    attempts: 5,
    backoff: { type: 'exponential', delay: 2000 },
    removeOnComplete: { age: 3600, count: 1000 },
    removeOnFail: false,
};
