import { Global, Module } from '@nestjs/common';
import { ClsPluginTransactional } from '@nestjs-cls/transactional';
import { TransactionalAdapterPrisma } from '@nestjs-cls/transactional-adapter-prisma';
import { ClsModule } from 'nestjs-cls';
import { PrismaModule } from '../prisma/prisma.module';
import { TENANT_DB, type TenantScopedClient } from '../prisma/transaction';
import { TenantContext } from './tenant-context';

/**
 * Global module that gives each request its own TenantContext.
 * `middleware.mount` starts a fresh nestjs-cls store at the beginning of every HTTP request.
 *
 * The transactional plugin keeps the current transaction in that same store: a service method
 * marked @Transactional() opens one transaction on the tenant-scoped client (TENANT_DB), and
 * every repository call inside it uses that transaction. sqlFlavor enables nested transactions
 * as savepoints.
 */
@Global()
@Module({
  imports: [
    ClsModule.forRoot({
      global: true,
      middleware: { mount: true },
      plugins: [
        new ClsPluginTransactional({
          imports: [PrismaModule],
          adapter: new TransactionalAdapterPrisma<TenantScopedClient>({
            prismaInjectionToken: TENANT_DB,
            sqlFlavor: 'postgresql',
          }),
        }),
      ],
    }),
  ],
  providers: [TenantContext],
  exports: [TenantContext],
})
export class TenancyModule {}
