import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { AuthController } from './auth.controller';
import { OAuthController } from './oauth.controller';
import { AuthService } from './auth.service';
import { OAuthService } from './oauth.service';
import { PasswordService } from './password.service';
import { TokenService } from './token.service';
import { MailService } from './mail.service';
import { EmailVerificationService } from './email-verification.service';
import { PasswordResetService } from './password-reset.service';
import { JwtStrategy } from './jwt.strategy';
import { USER_REPOSITORY } from './user.repository';
import { PrismaUserRepository } from './prisma-user.repository';
import { REFRESH_TOKEN_REPOSITORY } from './refresh-token.repository';
import { PrismaRefreshTokenRepository } from './prisma-refresh-token.repository';
import { EMAIL_VERIFICATION_TOKEN_REPOSITORY } from './email-verification-token.repository';
import { PrismaEmailVerificationTokenRepository } from './prisma-email-verification-token.repository';
import { PASSWORD_RESET_TOKEN_REPOSITORY } from './password-reset-token.repository';
import { PrismaPasswordResetTokenRepository } from './prisma-password-reset-token.repository';
import { DEVICE_REGISTRATION_REPOSITORY } from './device-registration.repository';
import { PrismaDeviceRegistrationRepository } from './prisma-device-registration.repository';

/**
 * Authentication (Slice 9a): local register/login, rotating refresh tokens, and
 * a JWT access cookie + guard. Real email + OAuth land in 9b/9c.
 *
 * Repos follow the project's repository pattern: the in-memory impls back the
 * unit tests; the Prisma impls back the running app (wired here).
 */
@Module({
  imports: [
    PassportModule,
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.get<string>('JWT_ACCESS_SECRET', 'dev-insecure-secret'),
        // Coerce to a number so expiresIn is seconds (a string would be ms).
        signOptions: {
          expiresIn: Number(config.get('JWT_ACCESS_TTL_SECONDS') ?? 900),
        },
      }),
    }),
  ],
  controllers: [AuthController, OAuthController],
  providers: [
    AuthService,
    OAuthService,
    PasswordService,
    TokenService,
    MailService,
    EmailVerificationService,
    PasswordResetService,
    JwtStrategy,
    { provide: USER_REPOSITORY, useClass: PrismaUserRepository },
    { provide: REFRESH_TOKEN_REPOSITORY, useClass: PrismaRefreshTokenRepository },
    {
      provide: EMAIL_VERIFICATION_TOKEN_REPOSITORY,
      useClass: PrismaEmailVerificationTokenRepository,
    },
    {
      provide: PASSWORD_RESET_TOKEN_REPOSITORY,
      useClass: PrismaPasswordResetTokenRepository,
    },
    {
      provide: DEVICE_REGISTRATION_REPOSITORY,
      useClass: PrismaDeviceRegistrationRepository,
    },
  ],
  // Export so later modules (ownership enforcement) can reuse the guard/strategy.
  exports: [USER_REPOSITORY, AuthService],
})
export class AuthModule {}
