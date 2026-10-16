import { Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import type { AuthenticatedRequest } from './jwt-auth.guard';

/**
 * ThrottlerGuard that counts per signed-in USER instead of per IP, for routes behind a login
 * (change-password). An attacker holding a stolen session cannot dodge the limit by changing
 * IP, and staff sharing one office IP do not block each other. Route guards run after the
 * global JwtAuthGuard, so req.auth is set; the IP is only a fallback.
 */
@Injectable()
export class UserThrottlerGuard extends ThrottlerGuard {
  protected getTracker(request: Record<string, unknown>): Promise<string> {
    const auth = (request as Partial<AuthenticatedRequest>).auth;
    return Promise.resolve(auth ? `user:${auth.userId}` : String(request.ip));
  }
}
