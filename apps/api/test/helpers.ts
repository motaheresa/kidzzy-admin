import { createHmac } from 'node:crypto';
import { Test } from '@nestjs/testing';
import type { INestApplication, Type } from '@nestjs/common';
import { getOptionsToken } from '@nestjs/throttler';
import { hash } from '@node-rs/argon2';
import { DateTime } from 'luxon';
import request from 'supertest';
import type { App } from 'supertest/types';
import { SystemRole } from '@kidzzy/shared';
import { seedAccess } from '../prisma/seed/access.seed';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.setup';
import { normalizeEmail, normalizePhone } from '../src/common/normalize/login-identifiers';
import { normalizeSearchText } from '../src/common/normalize/search-text';
import { RUN_JOBS_ON_STARTUP } from '../src/common/jobs/startup-run';
import { Clock } from '../src/modules/sessions/clock';
import { PUSH_SENDER, type PushSender } from '../src/modules/notifications/push-sender';
import { PrismaService } from '../src/modules/prisma/prisma.service';

/**
 * Starts the whole API exactly as main.ts does (same global setup).
 *
 * `loginRateLimit` and `passwordRateLimit` replace the limits of the 'login' and 'password'
 * (change-password) throttlers for this app only; giving one leaves the other at 1000, so it
 * never gets in the way. Tests never change
 * process.env at runtime: the config is validated and cached when AppModule is imported, so a
 * later change would be ignored, and it would leak into other tests in the same process.
 *
 * `extraControllers` adds test-only controllers (e.g. test/support/access-test.controller.ts) to
 * this app only. They are never part of AppModule, so they never exist in the real API.
 */
export async function createTestApp(
  options: {
    loginRateLimit?: number;
    passwordRateLimit?: number;
    /**
     * Fixes the time the API sees (Clock), so generation does not depend on the day of the run.
     * A function lets a test move the time while the app runs.
     */
    now?: Date | (() => Date);
    extraControllers?: Type<unknown>[];
    /** Replaces the web-push sender so a test never calls the push service. */
    pushSender?: PushSender;
    /**
     * The push tick and the session-reminder job each schedule one run a few seconds after boot.
     * Tests leave this off: every e2e file boots the API against the shared database.
     */
    runJobsOnStartup?: boolean;
  } = {},
): Promise<INestApplication<App>> {
  const builder = Test.createTestingModule({
    imports: [AppModule],
    controllers: options.extraControllers ?? [],
  });
  if (options.loginRateLimit !== undefined || options.passwordRateLimit !== undefined) {
    builder.overrideProvider(getOptionsToken()).useValue([
      { name: 'login', ttl: 60_000, limit: options.loginRateLimit ?? 1000 },
      { name: 'password', ttl: 60_000, limit: options.passwordRateLimit ?? 1000 },
    ]);
  }
  if (options.pushSender) {
    builder.overrideProvider(PUSH_SENDER).useValue(options.pushSender);
  }
  builder.overrideProvider(RUN_JOBS_ON_STARTUP).useValue(options.runJobsOnStartup ?? false);
  if (options.now) {
    const now = options.now;
    builder
      .overrideProvider(Clock)
      .useValue({ now: () => new Date(typeof now === 'function' ? now() : now) });
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
      nameSearch: normalizeSearchText(user.name),
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
  await prisma.unscoped.sessionReport.deleteMany({ where });
  await prisma.unscoped.sessionReminder.deleteMany({ where });
  await prisma.unscoped.paymentReminder.deleteMany({ where });
  await prisma.unscoped.reminderJob.deleteMany({ where });
  await prisma.unscoped.pushSubscription.deleteMany({ where });
  await prisma.unscoped.notification.deleteMany({ where });
  await prisma.unscoped.attendance.deleteMany({ where });
  await prisma.unscoped.auditLog.deleteMany({ where });
  await prisma.unscoped.payment.deleteMany({ where });
  await prisma.unscoped.cycleSession.deleteMany({ where });
  await prisma.unscoped.paymentCycle.deleteMany({ where });
  await prisma.unscoped.paymentPlan.deleteMany({ where });
  await prisma.unscoped.enrollment.deleteMany({ where });
  await prisma.unscoped.session.deleteMany({ where });
  await prisma.unscoped.scheduleSlot.deleteMany({ where });
  await prisma.unscoped.group.deleteMany({ where });
  await prisma.unscoped.student.deleteMany({ where });
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

/**
 * The body of POST /sessions/{id}/held that every existing test needs now: a topic and every
 * student of the session marked present (the roster rule of the API: the group's enrollments that
 * cover the session's academy-local date).
 */
export async function heldBody(
  prisma: PrismaService,
  sessionId: string,
): Promise<{ topic: string; attendance: { studentId: string; status: 'present' }[] }> {
  const session = await prisma.unscoped.session.findUniqueOrThrow({
    where: { id: sessionId },
    select: { groupId: true, scheduledAt: true, academy: { select: { timezone: true } } },
  });
  const day = DateTime.fromJSDate(session.scheduledAt, {
    zone: session.academy.timezone,
  }).toISODate();
  if (!day) throw new Error('The session time has no local date');
  const date = new Date(`${day}T00:00:00.000Z`);
  const enrollments = await prisma.unscoped.enrollment.findMany({
    where: {
      groupId: session.groupId,
      startDate: { lte: date },
      OR: [{ endDate: null }, { endDate: { gte: date } }],
    },
    select: { studentId: true },
  });
  return {
    topic: 'Test topic',
    attendance: enrollments.map((e) => ({ studentId: e.studentId, status: 'present' as const })),
  };
}

/**
 * POST /sessions/{id}/held with a complete body, built when the request is sent. It returns the
 * supertest request at once, so a test keeps writing `.expect(200)` as before; the body is
 * computed from the database just before the request goes out.
 */
export function postHeld(
  server: App,
  prisma: PrismaService,
  sessionId: string,
  token: string,
): request.Test {
  const req = request(server)
    .post(`/api/v1/sessions/${sessionId}/held`)
    .set({ Cookie: `access_token=${token}` });
  const end = req.end.bind(req) as (callback: request.CallbackHandler) => request.Test;
  req.end = ((callback: request.CallbackHandler) => {
    heldBody(prisma, sessionId).then(
      (body) => {
        void req.send(body);
        end(callback);
      },
      (error: unknown) => callback(error as Error, undefined as never),
    );
    return req;
  }) as typeof req.end;
  return req;
}
