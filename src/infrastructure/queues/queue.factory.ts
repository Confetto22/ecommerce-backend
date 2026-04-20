import { ConfigService } from '@nestjs/config';
import { JobsOptions, Queue } from 'bullmq';
import { createBullMqConnection } from './bullmq-connection.factory';
import { DEFAULT_JOB_OPTIONS } from './default-job-options';

export function createQueue(
    name: string,
    config: ConfigService,
    overrides: Partial<JobsOptions> = {},
): Queue {
    const connection = createBullMqConnection(config, name);
    return new Queue(name, {
        connection,
        defaultJobOptions: { ...DEFAULT_JOB_OPTIONS, ...overrides },
    });
}
