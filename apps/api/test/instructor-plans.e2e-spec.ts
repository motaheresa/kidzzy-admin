import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { SystemRole, type PaymentPlan } from '@kidzzy/shared';
import request from 'supertest';
import type { App } from 'supertest/types';
import { Prisma } from '../src/generated/prisma/client';
import { PrismaService } from '../src/modules/prisma/prisma.service';
import { createAcademy, createTestApp, createUser, readCookies, removeAcademy } from './helpers';

// US-21 (SCRUM-34): set or change an instructor's plan. The first plan is version 1 and opens
// cycle 1 from the starting point (BR-14); a later one is the next version from the cycle after
// the one in progress (BR-10), like a student's.

const NOW = new Date('2026-10-16T09:00:00.000Z');

describe('Instructor plans (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let academyId: string;
  let otherAcademyId: string;
  let adminId: string;
  let adminToken: string;
  let anaToken: string;
  let otherAdminToken: string;
  const password = 'correct-horse-1';
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  const mail = (name: string) => `${name}-${stamp}@test.local`;
  let count = 0;
  const first = { sessionsPerCycle: 8, amount: '2400.00' };

  const server = () => app.getHttpServer();
  const as = (token: string) => ({ Cookie: `access_token=${token}` });
  const api = (path: string) => `/api/v1${path}`;

  async function signIn(email: string) {
    const res = await request(server())
      .post(api('/auth/login'))
      .send({ login: email, password })
      .expect(200);
    return readCookies(res.headers['set-cookie']).access_token.value;
  }

  /** A new instructor with no plan, so each test starts clean. */
  async function newInstructor(isActive = true) {
    count += 1;
    return createUser(prisma, academyId, {
      name: `مدرس ${count}`,
      email: mail(`inst${count}`),
      password,
      role: SystemRole.Instructor,
      isActive,
    });
  }

  const setPlan = (instructorId: string, body: Record<string, unknown>, token = adminToken) =>
    request(server())
      .post(api(`/instructors/${instructorId}/payment-plans`))
      .set(as(token))
      .send(body);
  const versions = async (instructorId: string, token = adminToken) =>
    (
      (
        await request(server())
          .get(api('/payment-plans'))
          .query({ instructorId })
          .set(as(token))
          .expect(200)
      ).body as { data: PaymentPlan[] }
    ).data;
  const cyclesOf = (instructorId: string) =>
    prisma.unscoped.paymentCycle.findMany({
      where: { instructorId },
      orderBy: { cycleNumber: 'asc' },
    });

  beforeAll(async () => {
    app = await createTestApp({ loginRateLimit: 1000, now: NOW });
    prisma = app.get(PrismaService);
    academyId = await createAcademy(prisma, 'instructor-plans');
    otherAcademyId = await createAcademy(prisma, 'instructor-plans-other');
    adminId = await createUser(prisma, academyId, {
      name: 'admin',
      email: mail('admin'),
      password,
      role: SystemRole.Admin,
    });
    await createUser(prisma, academyId, {
      name: 'ana',
      email: mail('ana'),
      password,
      role: SystemRole.Instructor,
    });
    await createUser(prisma, otherAcademyId, {
      name: 'other-admin',
      email: mail('other-admin'),
      password,
      role: SystemRole.Admin,
    });
    adminToken = await signIn(mail('admin'));
    anaToken = await signIn(mail('ana'));
    otherAdminToken = await signIn(mail('other-admin'));
  });

  afterAll(async () => {
    await removeAcademy(prisma, academyId);
    await removeAcademy(prisma, otherAcademyId);
    await app.close();
  });

  describe('the first plan', () => {
    it('is version 1 and opens cycle 1 from the starting point', async () => {
      const instructor = await newInstructor();
      const res = await setPlan(instructor, { ...first, openingCount: 3 }).expect(201);
      expect(res.body).toEqual({
        id: expect.any(String) as string,
        payeeType: 'instructor',
        payeeId: instructor,
        sessionsPerCycle: 8,
        amount: '2400.00',
        effectiveFromCycle: 1,
        createdAt: expect.any(String) as string,
      });

      const cycles = await cyclesOf(instructor);
      expect(cycles).toHaveLength(1);
      expect(cycles[0]).toMatchObject({
        payeeType: 'instructor',
        studentId: null,
        cycleNumber: 1,
        planId: (res.body as PaymentPlan).id,
        sessionsPerCycle: 8,
        openingCount: 3,
        sessionsCounted: 3,
        status: 'in_progress',
        dueAt: null,
      });
      const rows = await prisma.unscoped.paymentPlan.findMany({
        where: { instructorId: instructor },
      });
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({ version: 1, studentId: null });
      expect(rows[0].amount.equals(new Prisma.Decimal('2400'))).toBe(true);
    });

    it('starts at 0 when no starting point is sent', async () => {
      const instructor = await newInstructor();
      await setPlan(instructor, first).expect(201);
      expect((await cyclesOf(instructor))[0]).toMatchObject({
        openingCount: 0,
        sessionsCounted: 0,
      });
    });

    it('refuses a starting point of N or more (422), and writes nothing', async () => {
      const instructor = await newInstructor();
      const res = await setPlan(instructor, { ...first, openingCount: 8 }).expect(422);
      expect(res.body).toMatchObject({ code: 'STARTING_POINT_OUT_OF_RANGE' });
      expect(await versions(instructor)).toEqual([]);
      expect(await cyclesOf(instructor)).toEqual([]);
    });

    it('an inactive instructor can still be given a plan (their pay may be due)', async () => {
      const instructor = await newInstructor(false);
      await setPlan(instructor, first).expect(201);
    });

    it('two first plans at once: one wins as version 1, the other is the next version', async () => {
      const instructor = await newInstructor();
      const results = await Promise.all([
        setPlan(instructor, { sessionsPerCycle: 8, amount: '2400.00' }),
        setPlan(instructor, { sessionsPerCycle: 4, amount: '1300.00' }),
      ]);
      expect(results.map((r) => r.status)).toEqual([201, 201]);
      const rows = await prisma.unscoped.paymentPlan.findMany({
        where: { instructorId: instructor },
      });
      expect(rows.map((r) => r.version).sort()).toEqual([1, 2]);
      expect(await cyclesOf(instructor)).toHaveLength(1); // one cycle 1, not two
    });
  });

  describe('a later plan', () => {
    it('is the next version from the cycle after the one in progress; the cycle keeps its plan', async () => {
      const instructor = await newInstructor();
      await setPlan(instructor, { ...first, openingCount: 2 }).expect(201);
      const [before] = await cyclesOf(instructor);

      const res = await setPlan(instructor, { sessionsPerCycle: 12, amount: '3500.25' }).expect(
        201,
      );
      expect(res.body).toMatchObject({
        sessionsPerCycle: 12,
        amount: '3500.25',
        effectiveFromCycle: 2,
      });
      const [after] = await cyclesOf(instructor);
      expect(after).toEqual(before);
      expect(
        (await versions(instructor)).map((p) => [
          p.sessionsPerCycle,
          p.amount,
          p.effectiveFromCycle,
        ]),
      ).toEqual([
        [8, '2400.00', 1],
        [12, '3500.25', 2],
      ]);
    });

    it('refuses a starting point (422 STARTING_POINT_LOCKED), and the same plan (409 PLAN_UNCHANGED)', async () => {
      const instructor = await newInstructor();
      await setPlan(instructor, first).expect(201);
      const locked = await setPlan(instructor, {
        sessionsPerCycle: 12,
        amount: '3500.00',
        openingCount: 1,
      }).expect(422);
      expect(locked.body).toMatchObject({ code: 'STARTING_POINT_LOCKED' });
      const same = await setPlan(instructor, first).expect(409);
      expect(same.body).toMatchObject({ code: 'PLAN_UNCHANGED' });
      expect(await versions(instructor)).toHaveLength(1);
    });
  });

  describe('refusals', () => {
    it('unknown, admin and other-academy ids are 404', async () => {
      const instructor = await newInstructor();
      await setPlan(randomUUID(), first).expect(404);
      await setPlan(adminId, first).expect(404); // an admin is not an instructor
      await setPlan(instructor, first, otherAdminToken).expect(404);
    });

    it('an instructor cannot set a plan, not even their own (payments.manage is the admin’s): 403', async () => {
      const instructor = await newInstructor();
      await setPlan(instructor, first, anaToken).expect(403);
    });

    it.each([
      ['an amount as a number', { sessionsPerCycle: 8, amount: 2400 }],
      ['an amount of zero', { sessionsPerCycle: 8, amount: '0.00' }],
      ['0 sessions', { sessionsPerCycle: 0, amount: '2400.00' }],
      ['101 sessions', { sessionsPerCycle: 101, amount: '2400.00' }],
      ['a negative starting point', { ...first, openingCount: -1 }],
      ['an unknown field', { ...first, effectiveFromCycle: 3 }],
    ])('refuses %s (400)', async (_label, body) => {
      const instructor = await newInstructor();
      await setPlan(instructor, body).expect(400);
    });
  });

  describe('reading', () => {
    it('the admin reads the versions; an instructor reads their own plan (scope own) and not others’', async () => {
      const ana = (
        await prisma.unscoped.user.findFirstOrThrow({ where: { academyId, email: mail('ana') } })
      ).id;
      await setPlan(ana, first).expect(201);
      expect(await versions(ana)).toHaveLength(1);
      expect(await versions(ana, anaToken)).toHaveLength(1);

      const other = await newInstructor();
      await setPlan(other, first).expect(201);
      await request(server())
        .get(api('/payment-plans'))
        .query({ instructorId: other })
        .set(as(anaToken))
        .expect(403);
    });
  });
});
