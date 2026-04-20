import { Global, Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { PrismaService } from "./database/prisma.service";
import { RedisService } from "./redis/redis.service";

@Global()
@Module({
    providers: [PrismaService, RedisService],
    imports: [ConfigModule],
    exports: [PrismaService, RedisService],
})
export class InfrastructureModule {}