import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Res,
  UseGuards,
} from '@nestjs/common';
import { AuthService } from './auth.service';
import { CreateAuthDto } from './dto/create-auth.dto';
import { UpdateAuthDto } from './dto/update-auth.dto';
import { CreateUserDto } from '../user/dto/create-user.dto';
import { CurrentUser } from 'src/common/decorators/current-user.decorator';
import { User } from '../user/entities/user.entity';
import { LoginDto } from './dto/login.dto';
import type { Response } from 'express';
import { LocalAuthGuard } from 'src/common/guards/local-auth.guard';
import { JwtRefreshAuthGuard } from 'src/common/guards/jwt-refresh-auth.guard';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('signup')
  async signup(@Body() signupData: CreateUserDto) {
    return this.authService.signup(signupData);
  }

  @Post('login')
  @UseGuards(LocalAuthGuard)
  async login(
    @CurrentUser() user: User,
    @Res({ passthrough: true }) res: Response,
  ) {
    await this.authService.login(user, res);
  }

  @Post('refresh')
  @UseGuards(JwtRefreshAuthGuard)
  async refreshToken(
    @CurrentUser() user: User,
    @Res({ passthrough: true }) res: Response,
  ) {
    await this.authService.login(user, res);
  }
}
