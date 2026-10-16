import { createHmac } from 'node:crypto';
import { Test } from '@nestjs/testing';
import type { INestApplication, Type } from '@nestjs/common';
import { getOptionsToken } from '@nestjs/throttler';
import { hash } from '@node-rs/argon2';
import type { App } from 'supertest/types';
import { SystemRole } from '@kidzzy/shared';
import { seedAccess } from '../prisma/seed/access.seed';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.setup';
import { normalizeEmail, normalizePhone } from '../src/common/normalize/login-identifiers';
import { PrismaService } from '../src/modules/prisma/prisma.service';

/**
 * Starts the whole API exactly as main.ts does (same global setup).
 *
 * `loginRateLimit` replaces the login throttler's limit for this app only. Tests never change
 * process.env at runtime: the config is validated and cached when AppModule is imported, so a
 * later change would be ignored, and it would leak into other tests in the same process.
 *
 * `extraControllers` adds test-only controllers (e.g. test/support/access-test.controller.ts) to
 * this app only. They are never part of AppModule, so they never exist in the real API.
 */
export async function createTestApp(
  options: { loginRateLimit?: number; extraControllers?: Type<unknown>[] } = {},
): Promise<INestApplication<App>> {
  const builder = Test.createTestingModule({
    imports: [AppModule],
    controllers: options.extraControllers ?? [],
  });
  if (options.loginRateLimit !== undefined) {
    builder
      .overrideProvider(getOptionsToken())
      .useValue([{ name: 'login', ttl: 60_000, limit: options.loginRateLimit }]);
  }
  const moduleRef = await builder.compile();
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
      // Stored the way the app stores them, exactly like a real write
      email: user.email === undefined ? null : normalizeEmail(user.email),
      phone: user.phone === undefined ? null : normalizePhone(user.phone),
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

/**
 * Builds a JWT by hand, so tests can forge tokens the app must refuse: signed with another
 * secret, expired, or with alg "none" (no signature at all).
 */
export function signTestJwt(
  payload: Record<string, unknown>,
  secret: string,
  alg: 'HS256' | 'none' = 'HS256',
): string {
  const encode = (value: object) => Buffer.from(JSON.stringify(value)).toString('base64url');
  const unsigned = `${encode({ alg, typ: 'JWT' })}.${encode(payload)}`;
  if (alg === 'none') return `${unsigned}.`;
  return `${unsigned}.${createHmac('sha256', secret).update(unsigned).digest('base64url')}`;
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
