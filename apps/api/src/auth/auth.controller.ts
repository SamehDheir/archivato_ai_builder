import {
  Body,
  Controller,
  Get,
  HttpCode,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request, Response } from 'express';
import type { AuthUser } from '@archivato/shared';
import { AuthService } from './auth.service';
import { TokenService } from './token.service';
import { EmailVerificationService } from './email-verification.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { VerifyEmailDto } from './dto/verify-email.dto';
import { JwtAuthGuard } from './jwt-auth.guard';
import { CurrentUser } from './current-user.decorator';
import { REFRESH_TOKEN_COOKIE } from './auth.constants';
import { clearAuthCookies, setAuthCookies } from './auth-cookies';

/**
 * Auth endpoints (Slice 9a). Tokens are delivered as httpOnly cookies; only the
 * public-safe `AuthUser` is returned in the body. `passthrough: true` lets us
 * set cookies while still returning a JSON body.
 */
@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly tokens: TokenService,
    private readonly emailVerification: EmailVerificationService,
    private readonly config: ConfigService,
  ) {}

  @Post('register')
  async register(
    @Body() dto: RegisterDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AuthUser> {
    const session = await this.auth.register(dto);
    setAuthCookies(res, this.config, session, this.tokens.accessTtlSeconds);
    return session.user;
  }

  @Post('login')
  @HttpCode(200)
  async login(
    @Body() dto: LoginDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AuthUser> {
    const session = await this.auth.login(dto);
    setAuthCookies(res, this.config, session, this.tokens.accessTtlSeconds);
    return session.user;
  }

  /** Rotate the refresh cookie and re-issue the access cookie. */
  @Post('refresh')
  @HttpCode(200)
  async refresh(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AuthUser> {
    const raw = readRefreshCookie(req);
    const session = await this.auth.refresh(raw ?? '');
    setAuthCookies(res, this.config, session, this.tokens.accessTtlSeconds);
    return session.user;
  }

  @Post('logout')
  @HttpCode(200)
  async logout(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<{ success: true }> {
    await this.auth.logout(readRefreshCookie(req));
    clearAuthCookies(res, this.config);
    return { success: true };
  }

  /** Confirm an email-verification token (from the emailed link). Public. */
  @Post('verify-email')
  @HttpCode(200)
  verifyEmail(@Body() dto: VerifyEmailDto): Promise<AuthUser> {
    return this.emailVerification.verify(dto.token);
  }

  /** Re-send the verification email to the signed-in user. */
  @Post('resend-verification')
  @HttpCode(200)
  @UseGuards(JwtAuthGuard)
  async resendVerification(
    @CurrentUser() user: AuthUser,
  ): Promise<{ success: true }> {
    await this.emailVerification.resend(user.id);
    return { success: true };
  }

  /** The currently authenticated user (requires a valid access cookie). */
  @Get('me')
  @UseGuards(JwtAuthGuard)
  me(@CurrentUser() user: AuthUser): AuthUser {
    return user;
  }
}

function readRefreshCookie(req: Request): string | undefined {
  const cookies = (req as Request & { cookies?: Record<string, string> })
    .cookies;
  return cookies?.[REFRESH_TOKEN_COOKIE];
}
