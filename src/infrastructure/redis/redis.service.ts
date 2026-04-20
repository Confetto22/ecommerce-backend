import {
    Injectable,
    Logger,
    OnModuleDestroy,
    OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Redis } from 'ioredis';

export type RedisNamespace =
    | 'cache'
    | 'ratelimit'
    | 'lock'
    | 'idem'
    | 'cart:guest';

@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
    private readonly logger = new Logger(RedisService.name);
    readonly client: Redis;

    constructor(private readonly config: ConfigService) {
        const url = this.config.getOrThrow<string>('REDIS_URL');
        this.client = new Redis(url, {
            lazyConnect: false,
        });

        this.client.on('error', (err) => {
            this.logger.warn(`Redis client error: ${err.message}`);
        });
    }

    async onModuleInit(): Promise<void> {
        if (this.config.get<string>('NODE_ENV') === 'production') return;

        try {
            const pong = await this.client.ping();
            this.logger.log(`Redis PING → ${pong}`);
        } catch (err) {
            this.logger.warn(
                `Redis PING failed at boot (app will keep booting): ${(err as Error).message}`,
            );
        }
    }

    async onModuleDestroy(): Promise<void> {
        try {
            await this.client.quit();
        } catch {
            this.client.disconnect();
        }
    }

    key(ns: RedisNamespace, parts: string[]): string {
        if (parts.length === 0) {
            throw new Error(`RedisService.key: parts must not be empty (ns=${ns})`);
        }
        return [ns, ...parts].join(':');
    }
}
