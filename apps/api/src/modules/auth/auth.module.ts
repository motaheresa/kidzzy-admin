import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { ThrottlerModule } from '@nestjs/throttler';
import { Clock } from '../sessions/clock';
import { UsersModule } from '../users/users.module';
import { AccessContext } from './access-context';
import { ACCESS_TOKEN_TTL_SECONDS } from './auth.config';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './jwt-auth.guard';
import { PasswordService } from './password.service';
import { PermissionsGuard } from './permissions.guard';
import { RefreshTokenRepository } from './refresh-token.repository';

/**
 * Authentication and authorization. Global so every feature module can inject AccessContext
 * (CLAUDE.md, Authorization) without importing this module.
 */
@Global()
@Module({
  imports: [
    UsersModule,
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.getOrThrow<string>('JWT_ACCESS_SECRET'),
        // Pinned here so every sign and every verify in the app uses HS256 only: a token that
        // names another algorithm (for example "none", which has no signature) is rejected.
        signOptions: { algorithm: 'HS256', expiresIn: ACCESS_TOKEN_TTL_SECONDS },
        verifyOptions: { algorithms: ['HS256'] },
      }),
    }),
    // Counts attempts in memory; one API instance in V1 (ADR-0007). Two named throttlers, each
    // route skipping the other's: 'login' per client IP, 'password' (change-password) per user.
    ThrottlerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => [
        // A positive integer, default 5, checked at startup by validateEnv.
        { name: 'login', ttl: 60_000, limit: config.getOrThrow<number>('LOGIN_RATE_LIMIT') },
        // Guessing the current password is the same attack as guessing at login: same limit.
        { name: 'password', ttl: 60_000, limit: config.getOrThrow<number>('LOGIN_RATE_LIMIT') },
      ],
    }),
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    PasswordService,
    RefreshTokenRepository,
    AccessContext,
    // The clock behind token expiry, so a test can fix the time (createTestApp({ now }) overrides
    // this class wherever it is provided). Stateless, so a second instance is harmless.
    Clock,
    // Registered globally, in this order: JwtAuthGuard authenticates (every route needs a login
    // unless it is @Public()), then PermissionsGuard enforces the route's declared access rule.
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: PermissionsGuard },
  ],
  exports: [AuthService, PasswordService, AccessContext],
})
export class AuthModule {}
