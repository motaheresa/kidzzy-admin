import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { SystemRole, type Group, type PaymentPlan, type Student } from '@kidzzy/shared';
import request from 'supertest';
import type { App } from 'supertest/types';
import { Prisma } from '../src/generated/prisma/client';
import { PrismaService } from '../src/modules/prisma/prisma.service';
import { createAcademy, createTestApp, createUser, readCookies, removeAcademy } from './helpers';

// US-20 (SCRUM-33): change a student's plan. BR-10: a change adds the next version, from the cycle
// after the one in progress; the cycle in progress keeps the plan it started with (AC).

const NOW = new Date('2026-10-16T09:00:00.000Z');

describe('Payment plans (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let academyId: string;
  let otherAcademyId: string;
  let ana: string;
  let adminId: string;
  let adminToken: string;
  let anaToken: string;
  let otherAdminToken: string;
  let group: Group;
  const password = 'correct-horse-1';
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  const mail = (name: string) => `${name}-${stamp}@test.local`;
  let codes = 0;

  const server = () => app.getHttpServer();
  const as = (token: string) => ({ Cookie: `access_token=${token}` });
  const api = (path: string) => `/api/v1${path}`;
  const plan1 = { sessionsPerCycle: 4, amount: '1500.00' };

  async function signIn(email: string) {
    const res = await request(server())
      .post(api('/auth/login'))
      .send({ login: email, password })
      .expect(200);
    return readCookies(res.headers['set-cookie']).access_token.value;
  }

  /** A student enrolled in the group with plan version 1 (4 sessions, 1500.00) and cycle 1. */
  async function enrolledStudent() {
    codes += 1;
    const created = await request(server())
      .post(api('/students'))
      .set(as(adminToken))
      .send({
        code: `P-${codes}`,
        name: `طالب ${codes}`,
        parentName: 'ولي',
        parentPhone: '01012345678',
      })
      .expect(201);
    const student = created.body as Student;
    await request(server())
      .post(api(`/groups/${group.id}/enrollments`))
      .set(as(adminToken))
      .send({ studentId: student.id, startDate: '2026-10-10', plan: plan1 })
      .expect(201);
    return student;
  }

  const change = (studentId: string, body: Record<string, unknown>, token = adminToken) =>
    request(server())
      .post(api(`/students/${studentId}/payment-plans`))
      .set(as(token))
      .send(body);
  const list = (query: Record<string, string>, token = adminToken) =>
    request(server()).get(api('/payment-plans')).query(query).set(as(token));
  const versions = async (studentId: string) =>
    (await list({ studentId }).expect(200)).body as { data: PaymentPlan[] };
  const cyclesOf = (studentId: string) =>
    prisma.unscoped.paymentCycle.findMany({
      where: { studentId },
      orderBy: { cycleNumber: 'asc' },
    });

  beforeAll(async () => {
    app = await createTestApp({ loginRateLimit: 1000, now: NOW });
    prisma = app.get(PrismaService);
    academyId = await createAcademy(prisma, 'plans');
    otherAcademyId = await createAcademy(prisma, 'plans-other');
    adminId = await createUser(prisma, academyId, {
      name: 'admin',
      email: mail('admin'),
      password,
      role: SystemRole.Admin,
    });
    ana = await createUser(prisma, academyId, {
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
    group = (
      await request(server())
        .post(api('/groups'))
        .set(as(adminToken))
        .send({
          name: 'Group P',
          level: 'Scratch 1',
          instructorId: ana,
          startDate: '2026-10-01',
          schedule: [{ weekday: 4, startTime: '17:00', durationMin: 60 }],
        })
        .expect(201)
    ).body as Group;
  });

  afterAll(async () => {
    await removeAcademy(prisma, academyId);
    await removeAcademy(prisma, otherAcademyId);
    await app.close();
  });

  describe('changing a student’s plan', () => {
    it('adds version 2 from the cycle after the one in progress; the cycle keeps its plan', async () => {
      const student = await enrolledStudent();
      const [cycleBefore] = await cyclesOf(student.id);

      const res = await change(student.id, { sessionsPerCycle: 8, amount: '2800.50' }).expect(201);
      expect(res.body).toEqual({
        id: expect.any(String) as string,
        payeeType: 'student',
        payeeId: student.id,
        groupId: null,
        groupName: null,
        sessionsPerCycle: 8,
        amount: '2800.50',
        effectiveFromCycle: 2,
        createdAt: expect.any(String) as string,
      });

      const [cycleAfter] = await cyclesOf(student.id);
      expect(cycleAfter).toEqual(cycleBefore); // same plan_id, same N, same counters
      const shown = await request(server())
        .get(api(`/students/${student.id}`))
        .set(as(adminToken))
        .expect(200);
      expect((shown.body as Student).currentCycle).toMatchObject({
        id: cycleBefore.id,
        cycleNumber: 1,
        sessionsPerCycle: 4,
        amount: '1500.00',
      });

      const { data } = await versions(student.id);
      expect(data.map((p) => [p.sessionsPerCycle, p.amount, p.effectiveFromCycle])).toEqual([
        [4, '1500.00', 1],
        [8, '2800.50', 2],
      ]);
      const rows = await prisma.unscoped.paymentPlan.findMany({
        where: { studentId: student.id },
        orderBy: { version: 'asc' },
      });
      expect(rows.map((r) => r.version)).toEqual([1, 2]);
      expect(rows[1].amount.equals(new Prisma.Decimal('2800.5'))).toBe(true);
    });

    it('with cycle 2 in progress, the new version applies from cycle 3', async () => {
      const student = await enrolledStudent();
      const [first] = await cyclesOf(student.id);
      // Cycle 1 is paid and cycle 2 is open: set directly, as counting and payments are later stories.
      await prisma.unscoped.paymentCycle.update({
        where: { id: first.id },
        data: { status: 'paid', sessionsCounted: 4, dueAt: NOW, paidAt: NOW },
      });
      await prisma.unscoped.paymentCycle.create({
        data: {
          academyId,
          payeeType: 'student',
          studentId: student.id,
          studentAcademyId: academyId,
          planId: first.planId,
          sessionsPerCycle: 4,
          cycleNumber: 2,
          sessionsCounted: 1,
        },
      });

      const res = await change(student.id, plan1Changed()).expect(201);
      expect((res.body as PaymentPlan).effectiveFromCycle).toBe(3);
      const cycles = await cyclesOf(student.id);
      expect(cycles.map((c) => [c.cycleNumber, c.planId === first.planId])).toEqual([
        [1, true],
        [2, true],
      ]);
    });

    it('two changes in the same cycle both apply from the next one; the newest wins', async () => {
      const student = await enrolledStudent();
      await change(student.id, { sessionsPerCycle: 6, amount: '2000.00' }).expect(201);
      await change(student.id, { sessionsPerCycle: 8, amount: '2800.00' }).expect(201);
      const { data } = await versions(student.id);
      expect(data.map((p) => [p.sessionsPerCycle, p.effectiveFromCycle])).toEqual([
        [4, 1],
        [6, 2],
        [8, 2],
      ]);
    });

    it('two changes at once get consecutive versions', async () => {
      const student = await enrolledStudent();
      const results = await Promise.all([
        change(student.id, { sessionsPerCycle: 6, amount: '2000.00' }),
        change(student.id, { sessionsPerCycle: 8, amount: '2800.00' }),
      ]);
      expect(results.map((r) => r.status)).toEqual([201, 201]);
      const rows = await prisma.unscoped.paymentPlan.findMany({ where: { studentId: student.id } });
      expect(rows.map((r) => r.version).sort()).toEqual([1, 2, 3]);
    });

    it('keeps cents exactly, up to the largest amount', async () => {
      const student = await enrolledStudent();
      await change(student.id, { sessionsPerCycle: 4, amount: '0.10' }).expect(201);
      await change(student.id, { sessionsPerCycle: 4, amount: '99999999.99' }).expect(201);
      const { data } = await versions(student.id);
      expect(data.map((p) => p.amount)).toEqual(['1500.00', '0.10', '99999999.99']);
    });
  });

  describe('refusals', () => {
    it('the same plan as the latest version changes nothing: 409 PLAN_UNCHANGED', async () => {
      const student = await enrolledStudent();
      const res = await change(student.id, plan1).expect(409);
      expect(res.body).toMatchObject({ code: 'PLAN_UNCHANGED' });
      expect((await versions(student.id)).data).toHaveLength(1);
    });

    it('a student who was never enrolled has no plan to change: 409 STUDENT_HAS_NO_PLAN', async () => {
      const created = await request(server())
        .post(api('/students'))
        .set(as(adminToken))
        .send({ code: 'P-NONE', name: 'بدون خطة', parentName: 'ولي', parentPhone: '01012345678' })
        .expect(201);
      const res = await change((created.body as Student).id, plan1Changed()).expect(409);
      expect(res.body).toMatchObject({ code: 'STUDENT_HAS_NO_PLAN' });
    });

    it('an unknown student and another academy’s student are 404', async () => {
      const student = await enrolledStudent();
      await change(randomUUID(), plan1Changed()).expect(404);
      await change(student.id, plan1Changed(), otherAdminToken).expect(404);
    });

    it('an instructor cannot change a plan (payments.manage is the admin’s): 403', async () => {
      const student = await enrolledStudent();
      await change(student.id, plan1Changed(), anaToken).expect(403);
    });

    it.each([
      ['an amount as a number', { sessionsPerCycle: 4, amount: 1500 }],
      ['an amount of zero', { sessionsPerCycle: 4, amount: '0.00' }],
      ['an amount with one decimal', { sessionsPerCycle: 4, amount: '15.5' }],
      ['0 sessions', { sessionsPerCycle: 0, amount: '1500.00' }],
      ['101 sessions', { sessionsPerCycle: 101, amount: '1500.00' }],
      ['no amount', { sessionsPerCycle: 4 }],
      ['an unknown field', { ...plan1, openingCount: 1 }],
    ])('refuses %s (400)', async (_label, body) => {
      const student = await enrolledStudent();
      await change(student.id, body).expect(400);
    });
  });

  describe('reading the versions', () => {
    it('needs exactly one of studentId and instructorId (400)', async () => {
      await list({}).expect(400);
      await list({ studentId: randomUUID(), instructorId: randomUUID() }).expect(400);
      await list({ studentId: 'KC-001' }).expect(400);
    });

    it('unknown payees and other academies’ are 404; an admin is not an instructor', async () => {
      const student = await enrolledStudent();
      await list({ studentId: randomUUID() }).expect(404);
      await list({ instructorId: randomUUID() }).expect(404);
      await list({ instructorId: adminId }).expect(404);
      await list({ studentId: student.id }, otherAdminToken).expect(404);
    });

    it('an instructor with no plan has an empty list', async () => {
      const res = await list({ instructorId: ana }).expect(200);
      expect(res.body).toEqual({ data: [] });
    });

    it('scope own: an instructor reads only their own plan; students’ and others’ are 403', async () => {
      const student = await enrolledStudent();
      await list({ instructorId: ana }, anaToken).expect(200);
      await list({ studentId: student.id }, anaToken).expect(403);
      await list({ instructorId: adminId }, anaToken).expect(403);
    });
  });
});

/** A plan different from version 1 (4 sessions, 1500.00). */
function plan1Changed() {
  return { sessionsPerCycle: 8, amount: '2800.00' };
}
