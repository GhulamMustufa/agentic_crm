import { Controller, Post, Get, Body, Req, HttpCode, HttpStatus, UseGuards } from '@nestjs/common';

import { Public, CurrentUser } from '../../../core/security/decorators/auth.decorators';
import { JwtAuthGuard } from '../../../core/security/guards/jwt-auth.guard';
import { AuthService } from '../services/auth.service';

import type { TenantSessionContext } from '../../../core/context/tenant-context.service';
import type { RegisterDto, LoginDto, RefreshTokenDto, AuthResponseDto } from '../dto/auth.dto';
import type { Request } from 'express';

@Controller('api/v1/auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Public()
  @Post('register')
  @HttpCode(HttpStatus.CREATED)
  async register(@Body() dto: RegisterDto): Promise<{ data: AuthResponseDto }> {
    const result = await this.authService.register(dto);
    return { data: result };
  }

  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(@Body() dto: LoginDto, @Req() req: Request): Promise<{ data: AuthResponseDto }> {
    const ip = req.ip || (req.headers['x-forwarded-for'] as string);
    const userAgent = req.headers['user-agent'];
    const result = await this.authService.login(dto, { ip, userAgent });
    return { data: result };
  }

  @Public()
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  async refresh(@Body() dto: RefreshTokenDto): Promise<{ data: AuthResponseDto }> {
    const result = await this.authService.refreshToken(dto);
    return { data: result };
  }

  @UseGuards(JwtAuthGuard)
  @Get('me')
  @HttpCode(HttpStatus.OK)
  async getMe(@CurrentUser() user: TenantSessionContext) {
    const profile = await this.authService.getProfile(user.userId);
    return { data: profile };
  }
}
