import { Controller, Get, UseInterceptors } from '@nestjs/common';
import { AppService } from './app.service';
import { SkipThrottle } from '@nestjs/throttler';
import { CacheInterceptor } from '@nestjs/cache-manager';

@UseInterceptors(CacheInterceptor)
@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @SkipThrottle()
    @Get('health')
  getHealth() {
    return this.appService.getHealth();
  }
}
