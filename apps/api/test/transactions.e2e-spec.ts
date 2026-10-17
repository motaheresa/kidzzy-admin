import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { TransactionHost } from '@nestjs-cls/transactional';
import { Test } from '@nestjs/testing';
import { seedAccess } from '../prisma/seed/access.seed';
import { AppModule } from '../src/app.module';
import { RefreshTokenRepository } from '../src/modules/auth/refresh-token.repository';
import { PrismaService } from '../src/modules/prisma/prisma.service';
import type { TenantTransactionalAdapter } from '../src/modules/prisma/transaction';
import { TenantContext } from '../src/modules/tenancy/tenant-context';
import { TenantViolationError } from '../src/modules/tenancy/tenancy.errors';

// @Transactional() and TransactionHost open transactions on the tenant-scoped client
// (ADR-0011). These tests prove a transaction keeps the academy scope and rolls back as one.

describe('Transactions (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let tenant: TenantContext;
  let txHost: TransactionHost<TenantTransactionalAdapter>;
  let refreshTokens: RefreshTokenRepository;
  let academyA: string;
  let academyB: string;
  let alice: string;
  let bob: string;
  const run = Date.now();
  const email = (name: string) => `${name}-${randomUUID()}@test.local`;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    prisma = app.get(PrismaService);
    tenant = app.get(TenantContext);
    txHost = app.get(TransactionHost);
    refreshTokens = app.get(RefreshTokenRepository);

    ({ academyId: academyA } = await seedAccess(prisma.unscoped, {
      name: `Test tx A ${run}`,
      timezone: 'Africa/Cairo',
    }));
    ({ academyId: academyB } = await seedAccess(prisma.unscoped, {
      name: `Test tx B ${run}`,
      timezone: 'Africa/Cairo',
    }));
    ({ id: alice } = await prisma.unscoped.user.create({
      data: {
        academyId: academyA,
        name: 'alice',
        nameSearch: 'alice',
        email: email('alice'),
        passwordHash: 'x',
      },
    }));
    ({ id: bob } = await prisma.unscoped.user.create({
      data: {
        academyId: academyB,
        name: 'bob',
        nameSearch: 'bob',
        email: email('bob'),
        passwordHash: 'x',
      },
    }));
  });

  afterAll(async () => {
    const ids = [academyA, academyB].filter(Boolean);
    await prisma.unscoped.refreshToken.deleteMany({ where: { academyId: { in: ids } } });
    await prisma.unscoped.user.deleteMany({ where: { academyId: { in: ids } } });
    await prisma.unscoped.role.deleteMany({ where: { academyId: { in: ids } } });
    await prisma.unscoped.academy.deleteMany({ where: { id: { in: ids } } });
    await app.close();
  });

  it('keeps queries inside a transaction limited to the current academy', async () => {
    const seen = await tenant.run(academyA, () =>
      txHost.withTransaction(async () => {
        expect(txHost.isTransactionActive()).toBe(true);
        return {
          names: await txHost.tx.user.findMany({ select: { name: true } }),
          bobById: await txHost.tx.user.findUnique({ where: { id: bob } }),
        };
      }),
    );
    expect(seen.names).toEqual([{ name: 'alice' }]);
    expect(seen.bobById).toBeNull();
  });

  it('refuses, inside a transaction, a write into another academy', async () => {
    await expect(
      tenant.run(academyA, () =>
        txHost.withTransaction(() =>
          txHost.tx.user.create({
            data: {
              academyId: academyB,
              name: 'mallory',
              nameSearch: 'mallory',
              email: email('mallory'),
              passwordHash: 'x',
            },
          }),
        ),
      ),
    ).rejects.toThrow(TenantViolationError);
  });

  it('rolls back every repository write when the transaction fails', async () => {
    const familyId = randomUUID();
    const tokenHash = `test-${randomUUID()}`;
    const newcomer = email('newcomer');

    await expect(
      tenant.run(academyA, () =>
        txHost.withTransaction(async () => {
          await refreshTokens.create({
            academyId: academyA,
            userId: alice,
            familyId,
            tokenHash,
            expiresAt: new Date(Date.now() + 60_000),
          });
          await txHost.tx.user.create({
            data: {
              academyId: academyA,
              name: 'newcomer',
              nameSearch: 'newcomer',
              email: newcomer,
              passwordHash: 'x',
            },
          });
          // Both writes are visible inside the transaction...
          expect(await txHost.tx.refreshToken.count({ where: { familyId } })).toBe(1);
          throw new Error('fail after two writes');
        }),
      ),
    ).rejects.toThrow('fail after two writes');

    // ...and neither exists after the rollback.
    expect(await prisma.unscoped.refreshToken.count({ where: { tokenHash } })).toBe(0);
    expect(await prisma.unscoped.user.count({ where: { email: newcomer } })).toBe(0);
  });

  it('commits the writes when the transaction succeeds', async () => {
    const tokenHash = `test-${randomUUID()}`;
    await tenant.run(academyA, () =>
      txHost.withTransaction(() =>
        refreshTokens.create({
          academyId: academyA,
          userId: alice,
          familyId: randomUUID(),
          tokenHash,
          expiresAt: new Date(Date.now() + 60_000),
        }),
      ),
    );
    expect(await prisma.unscoped.refreshToken.count({ where: { tokenHash } })).toBe(1);
  });
});
