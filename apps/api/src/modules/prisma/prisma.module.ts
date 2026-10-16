import { Global, Module } from '@nestjs/common';
import { PrismaService } from './prisma.service';
import { TENANT_DB } from './transaction';

/**
 * Global, so every repository can inject PrismaService without importing this module.
 * TENANT_DB is `prisma.db`, the client the transactional plugin opens transactions on.
 */
@Global()
@Module({
  providers: [
    PrismaService,
    {
      provide: TENANT_DB,
      inject: [PrismaService],
      useFactory: (prisma: PrismaService) => prisma.db,
    },
  ],
  exports: [PrismaService, TENANT_DB],
})
export class PrismaModule {}
