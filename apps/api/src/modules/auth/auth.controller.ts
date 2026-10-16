import { Body, Controller, HttpCode, HttpStatus, Post, Req, Res, UseGuards } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ThrottlerGuard } from '@nestjs/throttler';
import type { Me } from '@kidzzy/shared';
import type { Request, Response } from 'express';
import {
  ACCESS_COOKIE,
  ACCESS_COOKIE_PATH,
  ACCESS_TOKEN_TTL_SECONDS,
  cookieOptions,
  REFRESH_COOKIE,
  REFRESH_COOKIE_PATH,
  REFRESH_TOKEN_TTL_SECONDS,
} from './auth.config';
import { AuthService, type IssuedTokens } from './auth.service';
import { LoginDto } from './dto/login.dto';
import type { AuthenticatedRequest } from './jwt-auth.guard';
import { Public } from './public.decorator';

/** POST /auth/login, /auth/refresh and /auth/logout (US-01). Tokens only ever travel as cookies. */
@Controller('auth')
export class AuthController {
  private readonly secureCookies: boolean;

  constructor(
    private readonly auth: AuthService,
    config: ConfigService,
  ) {
    // Secure cookies need HTTPS; COOKIE_SECURE=false only for local development over http.
    // A boolean after validateEnv, which also refuses false in production.
    this.secureCookies = config.getOrThrow<boolean>('COOKIE_SECURE');
  }

  @Public()
  @UseGuards(ThrottlerGuard) // 5 attempts per minute per IP (API Design V1), then 429
  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(@Body() dto: LoginDto, @Res({ passthrough: true }) res: Response): Promise<Me> {
    const { me, tokens } = await this.auth.login(dto.login, dto.password);
    this.setCookies(res, tokens);
    return me;
  }

  @Public()
  @Post('refresh')
  @HttpCode(HttpStatus.NO_CONTENT)
  async refresh(@Req() req: Request, @Res({ passthrough: true }) res: Response): Promise<void> {
    const cookies = req.cookies as Record<string, string | undefined>;
    try {
      this.setCookies(res, await this.auth.refresh(cookies[REFRESH_COOKIE]));
    } catch (error) {
      this.clearCookies(res); // a dead refresh token is useless; drop it from the browser
      throw error;
    }
  }

  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  async logout(
    @Req() req: AuthenticatedRequest,
    @Res({ passthrough: true }) res: Response,
  ): Promise<void> {
    await this.auth.logout(req.auth.sessionId);
    this.clearCookies(res);
  }

  private setCookies(res: Response, tokens: IssuedTokens): void {
    res.cookie(
      ACCESS_COOKIE,
      tokens.accessToken,
      cookieOptions(this.secureCookies, ACCESS_COOKIE_PATH, ACCESS_TOKEN_TTL_SECONDS),
    );
    res.cookie(
      REFRESH_COOKIE,
      tokens.refreshToken,
      cookieOptions(this.secureCookies, REFRESH_COOKIE_PATH, REFRESH_TOKEN_TTL_SECONDS),
    );
  }

  private clearCookies(res: Response): void {
    // A cookie is only removed when path and flags match the ones it was set with.
    res.clearCookie(ACCESS_COOKIE, cookieOptions(this.secureCookies, ACCESS_COOKIE_PATH));
    res.clearCookie(REFRESH_COOKIE, cookieOptions(this.secureCookies, REFRESH_COOKIE_PATH));
  }
}
