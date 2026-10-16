import { Injectable } from '@nestjs/common';
import { ClsService, ClsStore } from 'nestjs-cls';
import { MissingTenantContextError } from './tenancy.errors';

/** What we keep per request in AsyncLocalStorage (via nestjs-cls). */
export interface TenantStore extends ClsStore {
  academyId?: string;
  userId?: string;
  /** The caller's permission keys from the access token (read by AccessContext). */
  permissions?: string[];
}

/**
 * The academy (tenant) and user the current request or job acts for.
 *
 * nestjs-cls gives every HTTP request its own store, so two requests from different academies
 * never see each other's values, without passing academyId through every function call.
 * The login guard (US-01) fills it from the JWT; background jobs use `run()`.
 */
@Injectable()
export class TenantContext {
  constructor(private readonly cls: ClsService<TenantStore>) {}

  /** The current academy, or undefined outside a request or job. */
  get academyId(): string | undefined {
    return this.cls.isActive() ? this.cls.get('academyId') : undefined;
  }

  get userId(): string | undefined {
    return this.cls.isActive() ? this.cls.get('userId') : undefined;
  }

  /** The current academy; throws when there is none, so tenant data is never read unscoped. */
  requireAcademyId(): string {
    const academyId = this.academyId;
    if (!academyId) throw new MissingTenantContextError();
    return academyId;
  }

  /** Sets the tenant for the rest of the current request. */
  set(academyId: string, userId?: string): void {
    this.cls.set('academyId', academyId);
    if (userId) this.cls.set('userId', userId);
  }

  /** Runs `fn` with its own tenant context, for code outside an HTTP request (jobs, tests). */
  run<T>(academyId: string, fn: () => PromiseLike<T>, userId?: string): Promise<T> {
    return this.cls.run(async () => {
      this.set(academyId, userId);
      // Awaiting here matters: a Prisma query is lazy and only starts when awaited, so returning
      // the unawaited promise would run it after this context has already ended.
      return await fn();
    });
  }
}
