import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { Prisma, PrismaClient } from '../../generated/prisma/client';
import { TenantContext } from '../tenancy/tenant-context';
import { scopeQueryArgs, TENANT_MODELS } from './tenant-scope';

/** A Prisma Client extension that runs every tenant-model query inside one academy. */
function tenantScoped(client: PrismaClient, getAcademyId: () => string) {
  return client.$extends(
    Prisma.defineExtension({
      name: 'tenant-scope',
      query: {
        $allModels: {
          $allOperations({ model, operation, args, query }) {
            if (!TENANT_MODELS.has(model)) return query(args);
            return query(scopeQueryArgs(model, operation, args, getAcademyId()));
          },
        },
      },
    }),
  );
}

export type TenantScopedClient = ReturnType<typeof tenantScoped>;

/**
 * Database access for the whole API (ADR-0006).
 *
 * - `db`: the client to use everywhere. Queries on tenant models (users, roles, and every later
 *   table with academy_id) are limited to the academy in TenantContext, and throw
 *   MissingTenantContextError when there is none.
 * - `unscoped`: the plain client, only for code that must cross academies on purpose
 *   (seed, scheduler, login lookup). Every use of it should be easy to justify in review.
 *
 * Raw SQL ($queryRaw) is never scoped automatically; it must filter by academy_id itself.
 */
@Injectable()
export class PrismaService implements OnModuleDestroy {
  readonly unscoped: PrismaClient;
  readonly db: TenantScopedClient;

  constructor(config: ConfigService, tenant: TenantContext) {
    const adapter = new PrismaPg({ connectionString: config.getOrThrow<string>('DATABASE_URL') });
    this.unscoped = new PrismaClient({ adapter });
    this.db = tenantScoped(this.unscoped, () => tenant.requireAcademyId());
  }

  async onModuleDestroy(): Promise<void> {
    await this.unscoped.$disconnect();
  }
}
