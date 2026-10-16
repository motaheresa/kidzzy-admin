import { randomUUID } from 'node:crypto';
import { SYSTEM_ROLE_PERMISSIONS } from '@kidzzy/shared';
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import { seedAccess } from '../prisma/seed/access.seed';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/modules/prisma/prisma.service';
import { TenantContext } from '../src/modules/tenancy/tenant-context';
import {
  MissingTenantContextError,
  TenantViolationError,
} from '../src/modules/tenancy/tenancy.errors';

// Runs against a real PostgreSQL with the migrations applied (DATABASE_URL).
// It creates its own academies with unique names and deletes them afterwards,
// so it never touches other data in a local development database.

describe('Tenancy (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let tenant: TenantContext;
  const run = Date.now();
  let academyA: string;
  let academyB: string;

  const user = (name: string) => ({
    name,
    email: `${name}-${randomUUID()}@test.local`,
    passwordHash: 'x',
  });

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    prisma = app.get(PrismaService);
    tenant = app.get(TenantContext);

    ({ academyId: academyA } = await seedAccess(prisma.unscoped, {
      name: `Test A ${run}`,
      timezone: 'Africa/Cairo',
    }));
    ({ academyId: academyB } = await seedAccess(prisma.unscoped, {
      name: `Test B ${run}`,
      timezone: 'Africa/Cairo',
    }));
    await prisma.unscoped.user.create({ data: { academyId: academyA, ...user('alice') } });
    await prisma.unscoped.user.create({ data: { academyId: academyB, ...user('bob') } });
  });

  afterAll(async () => {
    const ids = [academyA, academyB].filter(Boolean);
    await prisma.unscoped.user.deleteMany({ where: { academyId: { in: ids } } });
    await prisma.unscoped.role.deleteMany({ where: { academyId: { in: ids } } });
    await prisma.unscoped.academy.deleteMany({ where: { id: { in: ids } } });
    await app.close();
  });

  it('reads only the current academy', async () => {
    const names = await tenant.run(academyA, () =>
      prisma.db.user.findMany({ select: { name: true } }),
    );
    expect(names).toEqual([{ name: 'alice' }]);
    expect(await tenant.run(academyB, () => prisma.db.user.count())).toBe(1);
  });

  it('cannot find another academy’s row even by its id', async () => {
    const bob = await prisma.unscoped.user.findFirstOrThrow({ where: { academyId: academyB } });
    const found = await tenant.run(academyA, () =>
      prisma.db.user.findUnique({ where: { id: bob.id } }),
    );
    expect(found).toBeNull();
  });

  it('cannot update or delete another academy’s row', async () => {
    const bob = await prisma.unscoped.user.findFirstOrThrow({ where: { academyId: academyB } });
    await expect(
      tenant.run(academyA, () =>
        prisma.db.user.update({ where: { id: bob.id }, data: { name: 'hacked' } }),
      ),
    ).rejects.toMatchObject({ code: 'P2025' });
    const deleted = await tenant.run(academyA, () =>
      prisma.db.user.deleteMany({ where: { id: bob.id } }),
    );
    expect(deleted.count).toBe(0);
    expect((await prisma.unscoped.user.findUniqueOrThrow({ where: { id: bob.id } })).name).toBe(
      'bob',
    );
  });

  it('creates rows in the current academy without being told which', async () => {
    // The generated types still require academyId on create (the extension does not change
    // types), so services pass tenant.requireAcademyId(). This test leaves it out on purpose
    // to prove the extension fills it in at runtime.
    const created = await tenant.run(academyA, () =>
      prisma.db.user.create({ data: user('carol') as never }),
    );
    expect(created.academyId).toBe(academyA);
  });

  it('refuses to write a row into another academy', async () => {
    await expect(
      tenant.run(academyA, () =>
        prisma.db.user.create({ data: { ...user('mallory'), academyId: academyB } }),
      ),
    ).rejects.toThrow(TenantViolationError);
  });

  it('rejects tenant queries with no academy in context', async () => {
    await expect(prisma.db.user.findMany()).rejects.toThrow(MissingTenantContextError);
  });

  it('leaves global tables unscoped', async () => {
    const count = await prisma.db.permission.count();
    expect(count).toBeGreaterThan(0);
  });

  it('enforces email or phone at the database level', async () => {
    await expect(
      prisma.unscoped.user.create({
        data: { academyId: academyA, name: 'nobody', passwordHash: 'x' },
      }),
    ).rejects.toThrow(/users_email_or_phone_check/);
  });

  it.each(['Upper@test.local', ' padded@test.local', ''])(
    'rejects a non-normalized email %j at the database level',
    async (email) => {
      await expect(
        prisma.unscoped.user.create({
          data: { academyId: academyA, name: 'raw', email, passwordHash: 'x' },
        }),
      ).rejects.toThrow(/users_email_normalized_check/);
    },
  );

  it.each(['010 1234 5678', '010-1234-5678', '12345', '0101234+5678'])(
    'rejects a non-normalized phone %j at the database level',
    async (phone) => {
      await expect(
        prisma.unscoped.user.create({
          data: { academyId: academyA, name: 'raw', phone, passwordHash: 'x' },
        }),
      ).rejects.toThrow(/users_phone_format_check/);
    },
  );

  it('accepts normalized email and phone', async () => {
    const created = await prisma.unscoped.user.create({
      data: {
        academyId: academyA,
        name: 'clean',
        email: `clean-${run}@test.local`,
        phone: `+2010${String(run).slice(-8)}`,
        passwordHash: 'x',
      },
    });
    expect(created.id).toBeTruthy();
  });

  it('seeds Admin and Instructor with their permissions, idempotently', async () => {
    await seedAccess(prisma.unscoped, { name: `Test A ${run}`, timezone: 'Africa/Cairo' });
    const roles = await tenant.run(academyA, () =>
      prisma.db.role.findMany({
        select: {
          name: true,
          isSystem: true,
          permissions: { select: { permission: { select: { key: true } } } },
        },
        orderBy: { name: 'asc' },
      }),
    );
    expect(roles.map((r) => [r.name, r.isSystem])).toEqual([
      ['Admin', true],
      ['Instructor', true],
    ]);
    for (const role of roles) {
      const keys = role.permissions.map((p) => p.permission.key).sort();
      expect(keys).toEqual(
        [...SYSTEM_ROLE_PERMISSIONS[role.name as 'Admin' | 'Instructor']].sort(),
      );
    }
  });
});
