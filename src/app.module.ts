import { Module } from '@nestjs/common';
import { CacheModule } from '@nestjs/cache-manager';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { ConfigModule } from '@nestjs/config';
import { APP_FILTER } from '@nestjs/core';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import * as redisStore from 'cache-manager-redis-store';
import { InfrastructureModule } from './infrastructure/infrastructure.module';
import { AuthModule } from './modules/auth/auth.module';
@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true }), CacheModule.register({
    isGlobal: true,
    store: redisStore,
    socket: {
     host: 'localhost',
     port: 8080
   }
  }), InfrastructureModule, AuthModule],
  controllers: [AppController],
  providers: [AppService,
    {
      provide: APP_FILTER,
      useClass: AllExceptionsFilter
    }
  ],
})
export class AppModule {}
