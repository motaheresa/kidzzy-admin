import { CanActivate, ExecutionContext, HttpStatus, Injectable, Logger } from '@nestjs/common';
import { ErrorCode } from '@kidzzy/shared';
import { AppException } from '../../common/errors/app.exception';
import { accessDeclarationsOf, isAllowedDuringPasswordChange } from './access.decorators';
import type { AuthenticatedRequest } from './jwt-auth.guard';
import { scopeOf } from './permission-scope';

/**
 * Global guard, registered right after JwtAuthGuard (ADR-0006, ADR-0013). It enforces the one
 * access rule each route declares, using the permission keys carried in the access token: no
 * database query per request.
 *
 * While the token says mustChangePassword, every non-public route answers 403
 * PASSWORD_CHANGE_REQUIRED, except those marked @AllowedDuringPasswordChange() (US-02).
 *
 * Fail closed: a route that declares no rule, or more than one, is refused (and logged), so a
 * forgotten decorator can never open a route. test/route-declarations.e2e-spec.ts catches it
 * before that, in CI.
 */
@Injectable()
export class PermissionsGuard implements CanActivate {
  private readonly logger = new Logger(PermissionsGuard.name);

  canActivate(context: ExecutionContext): boolean {
    const handler = context.getHandler();
    const controller = context.getClass();
    const declarations = accessDeclarationsOf(handler, controller);

    if (declarations.length !== 1) {
      this.logger.error(
        `${controller.name}.${handler.name} declares ${declarations.length} access rules; ` +
          'it needs exactly one of @Public(), @SignedIn() or @RequirePermission().',
      );
      throw forbidden();
    }

    const [declaration] = declarations;
    if (declaration.kind === 'public') return true;

    const request = context.switchToHttp().getRequest<Partial<AuthenticatedRequest>>();
    // JwtAuthGuard sets req.auth on every non-public route; without it, refuse.
    if (!request.auth) throw unauthenticated();
    // A temporary password must be replaced before anything else (US-02). Checked before the
    // permission, so the client learns the reason it can act on.
    if (request.auth.mustChangePassword && !isAllowedDuringPasswordChange(handler)) {
      throw new AppException(
        ErrorCode.PasswordChangeRequired,
        HttpStatus.FORBIDDEN,
        'Change your password first',
      );
    }
    if (declaration.kind === 'signedIn') return true;

    if (scopeOf(request.auth.permissions, declaration.action)) return true;
    throw forbidden();
  }
}

function forbidden(): AppException {
  return new AppException(ErrorCode.Forbidden, HttpStatus.FORBIDDEN, 'Not allowed');
}

function unauthenticated(): AppException {
  return new AppException(ErrorCode.Unauthenticated, HttpStatus.UNAUTHORIZED, 'Sign in again');
}
