import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { PrismaClient, Prisma } from "generated/prisma/client";
import { PrismaPg } from '@prisma/adapter-pg';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
    private readonly logger = new Logger(PrismaService.name);

    constructor(private readonly config: ConfigService) { 
        const adapter = new PrismaPg({
            connectionString: config.getOrThrow('DATABASE_URL')
        });
        super({adapter})
    }

    async onModuleInit(): Promise<void> {
        await this.$connect();
        this.logger.log('Prisma connected');
    }

    async onModuleDestroy(): Promise<void> {
        await this.$disconnect();
        this.logger.log('Prisma disconnected');
    }

    runInTransaction<T>(fn: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
        return this.$transaction(fn);
    }
}