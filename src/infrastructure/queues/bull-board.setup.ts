/**
 * BullBoard dashboard mount.
 *
 * NOTE: uses @bull-board/express under the hood. If this project ever migrates
 * to Fastify, this file must be rewritten to use @bull-board/fastify.
 *
 * TODO(phase-15): protect with AdminAuthGuard. For now this is mounted only
 * when NODE_ENV !== 'production' (see main.ts), so it's not publicly exposed.
 */
import { INestApplication, Logger } from '@nestjs/common';
import { createBullBoard } from '@bull-board/api';
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter';
import { ExpressAdapter } from '@bull-board/express';
import type { Queue } from 'bullmq';

export function mountBullBoard(
    app: INestApplication,
    queues: Queue[],
    basePath = '/admin/queues',
): void {
    const serverAdapter = new ExpressAdapter();
    serverAdapter.setBasePath(basePath);

    createBullBoard({
        queues: queues.map((q) => new BullMQAdapter(q)),
        serverAdapter,
    });

    app.use(basePath, serverAdapter.getRouter());
    new Logger('BullBoard').log(`Dashboard mounted at ${basePath}`);
}
