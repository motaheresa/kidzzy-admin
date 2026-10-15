import { CanActivate, ExecutionContext, HttpStatus, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { ErrorCode } from '@kidzzy/shared';
import type { Request } from 'express';
import { AppException } from '../../common/errors/app.exception';
import { TenantContext } from '../tenancy/tenant-context';
import { ACCESS_COOKIE, type AccessTokenPayload } from './auth.config';
import { IS_PUBLIC_KEY } from './public.decorator';

/** The signed-in caller, attached to the request by JwtAuthGuard. */
export interface AuthenticatedRequest extends Request {
  auth: { userId: string; academyId: string; sessionId: string };
}

/**
 * Global guard: runs before every route handler.
 * It verifies the access-token cookie, then puts the user and academy into TenantContext, which
 * is what makes `prisma.db` scope every query of this request to that academy (ADR-0006).
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly jwt: JwtService,
    private readonly tenant: TenantContext,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const token = (request.cookies as Record<string, string | undefined>)[ACCESS_COOKIE];
    if (!token) throw unauthenticated();

    let payload: AccessTokenPayload;
    try {
      payload = await this.jwt.verifyAsync<AccessTokenPayload>(token);
    } catch {
      throw unauthenticated(); // expired, tampered with, or signed with another secret
    }

    this.tenant.set(payload.aid, payload.sub);
    request.auth = { userId: payload.sub, academyId: payload.aid, sessionId: payload.sid };
    return true;
  }
}

function unauthenticated(): AppException {
  return new AppException(ErrorCode.Unauthenticated, HttpStatus.UNAUTHORIZED, 'Sign in again');
}
