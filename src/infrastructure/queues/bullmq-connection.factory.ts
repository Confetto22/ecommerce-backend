import { ConfigService } from '@nestjs/config';
import { Redis } from 'ioredis';

/**
 * BullMQ requires `maxRetriesPerRequest: null` and `enableReadyCheck: false`.
 * These options are incompatible with the general cache client, which is why
 * this factory lives in its own file and MUST NOT be reused by RedisService.
 *
 * One connection per queue/worker (see plan §3.2) avoids head-of-line blocking
 * when a single queue gets flooded.
 */
export function createBullMqConnection(
    config: ConfigService,
    queueName: string,
): Redis {
    const url =
        config.get<string>('BULLMQ_REDIS_URL') ??
        config.getOrThrow<string>('REDIS_URL');

    return new Redis(url, {
        maxRetriesPerRequest: null,
        enableReadyCheck: false,
        connectionName: `bullmq:${queueName}`,
    });
}
