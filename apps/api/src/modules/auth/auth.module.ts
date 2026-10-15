import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { ThrottlerModule } from '@nestjs/throttler';
import { ACCESS_TOKEN_TTL_SECONDS } from './auth.config';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './jwt-auth.guard';
import { PasswordService } from './password.service';

@Module({
  imports: [
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
    // Counts login attempts per client IP in memory; one API instance in V1 (ADR-0007).
    ThrottlerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => [
        { name: 'login', ttl: 60_000, limit: Number(config.get('LOGIN_RATE_LIMIT') ?? 5) },
      ],
    }),
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    PasswordService,
    // Registered globally: every route of every module requires a login unless marked @Public().
    { provide: APP_GUARD, useClass: JwtAuthGuard },
  ],
  exports: [AuthService, PasswordService],
})
export class AuthModule {}
