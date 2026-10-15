import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import { hash } from '@node-rs/argon2';
import type { App } from 'supertest/types';
import { SystemRole } from '@kidzzy/shared';
import { seedAccess } from '../prisma/seed/access.seed';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.setup';
import { PrismaService } from '../src/modules/prisma/prisma.service';

/** Starts the whole API exactly as main.ts does (same global setup). */
export async function createTestApp(): Promise<INestApplication<App>> {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  const app = moduleRef.createNestApplication<INestApplication<App>>();
  configureApp(app);
  await app.init();
  return app;
}

/** A throwaway academy with seeded roles; remove it with `removeAcademy`. */
export async function createAcademy(prisma: PrismaService, label: string): Promise<string> {
  const name = `Test ${label} ${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const { academyId } = await seedAccess(prisma.unscoped, { name, timezone: 'Africa/Cairo' });
  return academyId;
}

export async function createUser(
  prisma: PrismaService,
  academyId: string,
  user: {
    name: string;
    email?: string;
    phone?: string;
    password: string;
    role: SystemRole;
    isActive?: boolean;
  },
): Promise<string> {
  const role = await prisma.unscoped.role.findUniqueOrThrow({
    where: { academyId_name: { academyId, name: user.role } },
  });
  const created = await prisma.unscoped.user.create({
    data: {
      academyId,
      name: user.name,
      email: user.email ?? null,
      phone: user.phone ?? null,
      passwordHash: await hash(user.password),
      isActive: user.isActive ?? true,
      roles: { create: { roleId: role.id } },
    },
  });
  return created.id;
}

/** Deletes everything a test academy owns, in foreign-key order. */
export async function removeAcademy(prisma: PrismaService, academyId: string): Promise<void> {
  const where = { academyId };
  await prisma.unscoped.refreshToken.deleteMany({ where });
  await prisma.unscoped.user.deleteMany({ where });
  await prisma.unscoped.role.deleteMany({ where });
  await prisma.unscoped.academy.deleteMany({ where: { id: academyId } });
}

/** Parses Set-Cookie headers into { name: { value, attributes } }. */
export function readCookies(
  setCookie: string | string[] | undefined,
): Record<string, { value: string; attributes: string }> {
  const headers = Array.isArray(setCookie) ? setCookie : setCookie ? [setCookie] : [];
  return Object.fromEntries(
    headers.map((header) => {
      const [pair, ...attributes] = header.split(';');
      const index = pair.indexOf('=');
      return [
        pair.slice(0, index).trim(),
        { value: pair.slice(index + 1), attributes: attributes.join(';') },
      ];
    }),
  );
}
