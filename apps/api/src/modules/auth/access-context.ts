import { HttpStatus, Injectable } from '@nestjs/common';
import { ErrorCode, type PermissionAction, type PermissionScope } from '@kidzzy/shared';
import { ClsService } from 'nestjs-cls';
import { AppException } from '../../common/errors/app.exception';
import type { TenantStore } from '../tenancy/tenant-context';
import { scopeOf } from './permission-scope';

/**
 * Who is calling and what they may see, for services (CLAUDE.md "Authorization").
 *
 * The route's @RequirePermission('groups.read') already let the caller in; the service asks for
 * the scope and passes it to the repository, which filters by the caller when it is 'own':
 *
 *   const scope = this.access.scopeFor('groups.read');
 *   return this.groups.list(scope === 'own' ? { instructorId: this.access.userId } : {});
 *
 * For one record: load it (another academy's row is not found, 404), then
 * `this.access.ensureOwner(scope, group.instructorId)` answers 403 when it is not theirs.
 */
@Injectable()
export class AccessContext {
  constructor(private readonly cls: ClsService<TenantStore>) {}

  /** The signed-in user. */
  get userId(): string {
    const userId = this.cls.isActive() ? this.cls.get('userId') : undefined;
    if (!userId) throw unauthenticated();
    return userId;
  }

  private get permissions(): string[] {
    return (this.cls.isActive() ? this.cls.get('permissions') : undefined) ?? [];
  }

  /** True when the caller holds `action` with either scope. */
  can(action: PermissionAction): boolean {
    return scopeOf(this.permissions, action) !== null;
  }

  /** 'any' or 'own' for `action`; 403 FORBIDDEN when the caller holds neither. */
  scopeFor(action: PermissionAction): PermissionScope {
    const scope = scopeOf(this.permissions, action);
    if (!scope) throw forbidden();
    return scope;
  }

  /** With scope 'own', the record must belong to the caller; otherwise 403 FORBIDDEN. */
  ensureOwner(scope: PermissionScope, ownerId: string | null | undefined): void {
    if (scope === 'own' && ownerId !== this.userId) throw forbidden();
  }
}

function forbidden(): AppException {
  return new AppException(ErrorCode.Forbidden, HttpStatus.FORBIDDEN, 'Not allowed');
}

function unauthenticated(): AppException {
  return new AppException(ErrorCode.Unauthenticated, HttpStatus.UNAUTHORIZED, 'Sign in again');
}
