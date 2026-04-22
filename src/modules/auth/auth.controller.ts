import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  HttpStatus,
  HttpCode,
  Res,
} from '@nestjs/common';
import { AuthService } from './auth.service';
import { RegisterUserDto } from './dto/register-user.dto';
import { LoginDto } from './dto/login.dto';
import type { Response } from 'express';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('register')
  @HttpCode(HttpStatus.CREATED)
  async create(@Body() registerData: RegisterUserDto) {
    return await this.authService.register(registerData);
  }

  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(
    @Body() loginData: LoginDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    return await this.authService.login(
      loginData.email,
      loginData.password,
      loginData.rememberMe || false,
      res,
    );
  }
}
