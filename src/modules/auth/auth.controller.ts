import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';

import { CurrentUser } from 'src/common/decorators/current-user.decorator';
import { JwtAuthGuard } from 'src/common/guards/jwt-auth.guard';
import { JwtRefreshAuthGuard } from 'src/common/guards/jwt-refresh-auth.guard';
import { LocalAuthGuard } from 'src/common/guards/local-auth.guard';
import type { RefreshRequestUser } from 'src/common/types/auth-request.types';

import { User } from '../user/entities/user.entity';
import { AuthService } from './auth.service';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { LoginDto } from './dto/login.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { SignupDto } from './dto/signup.dto';
import { Public } from 'src/common/decorators/public.decorator';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Public()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('signup')
  @HttpCode(HttpStatus.OK)
  async signup(@Body() signupData: SignupDto) {
    return this.authService.signup(signupData);
  }

  /**
   * `LoginDto` runs through the validation pipe AFTER LocalAuthGuard, so
   * passport gets first crack at the credentials. It still acts as a guard
   * against unexpected fields and gives Swagger something to document.
   */
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Public()
  @Post('login')
  @UseGuards(LocalAuthGuard)
  @HttpCode(HttpStatus.OK)
  async login(
    @Body() _loginDto: LoginDto,
    @CurrentUser() user: User,
    @Res({ passthrough: true }) res: Response,
  ) {
    return this.authService.login(user, res);
  }

  /**
   * Single-device logout. Uses access token to identify the user, then
   * looks at the refresh cookie to know *which* session to terminate.
   */

  @Public()
  @Post('logout')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  async logout(
    @CurrentUser() user: User,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const refreshToken: string | undefined = req.cookies?.refreshToken;
    await this.authService.logout(user.id, refreshToken, res);
    return { message: 'Logged out successfully' };
  }

  /** Logout from every device for the current user. */
  @Public()
  @Post('logout-all')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  async logoutAll(
    @CurrentUser() user: User,
    @Res({ passthrough: true }) res: Response,
  ) {
    await this.authService.logoutAll(user.id, res);
    return { message: 'Logged out from all devices' };
  }

  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @Post('refresh')
  @UseGuards(JwtRefreshAuthGuard)
  @HttpCode(HttpStatus.OK)
  async refresh(
    @CurrentUser() refresher: RefreshRequestUser,
    @Res({ passthrough: true }) res: Response,
  ) {
    return this.authService.refreshAccessToken(refresher, res);
  }

  @Public()
  @Throttle({ default: { limit: 3, ttl: 3_600_000 } })
  @Post('forgot-password')
  @HttpCode(HttpStatus.OK)
  async forgotPassword(@Body() forgotPasswordDto: ForgotPasswordDto) {
    const { message } = await this.authService.forgotPassword(
      forgotPasswordDto.email,
    );
    // `rawToken` is intentionally not surfaced to the client; the service
    // returns it so an email module can pick it up. Until email is wired,
    // wire your email sender to call `forgotPassword` directly.
    return { message };
  }

  /** Verify email using `?token=` from outbound mail (preferred). */
  @Public()
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @Get('verify-email')
  @HttpCode(HttpStatus.OK)
  async verifyEmailQuery(@Query('token') token?: string) {
    if (!token?.trim()) {
      throw new BadRequestException(
        'Missing verification token. Use the full link from your email.',
      );
    }
    return await this.authService.verifyEmail(token);
  }

  /** Legacy path-style link `verify-email/:token` (still supported). */
  @Public()
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @Get('verify-email/:token')
  @HttpCode(HttpStatus.OK)
  async verifyEmailParam(@Param('token') token: string) {
    return await this.authService.verifyEmail(token.trim());
  }

  @Public()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('reset-password')
  @HttpCode(HttpStatus.OK)
  async resetPassword(@Body() resetPasswordDto: ResetPasswordDto) {
    return this.authService.resetPassword(
      resetPasswordDto.token,
      resetPasswordDto.password,
    );
  }
}
