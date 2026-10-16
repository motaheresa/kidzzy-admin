import type { TransactionHost } from '@nestjs-cls/transactional';
import type { TransactionalAdapterPrisma } from '@nestjs-cls/transactional-adapter-prisma';
import type { TenantScopedClient } from './prisma.service';

export type { TenantScopedClient };

/**
 * Injection token of the tenant-scoped client (`prisma.db`). The transactional adapter opens
 * its transactions on THIS client, so a transaction's queries keep the tenant scope.
 */
export const TENANT_DB = Symbol('TENANT_DB');

/** The adapter type for the tenant-scoped client. */
export type TenantTransactionalAdapter = TransactionalAdapterPrisma<TenantScopedClient>;

/**
 * What repositories inject to query: `txHost.tx` is the transaction's client inside a method
 * marked @Transactional(), and `prisma.db` itself outside one. Both are tenant-scoped.
 */
export type TenantTransactionHost = TransactionHost<TenantTransactionalAdapter>;
