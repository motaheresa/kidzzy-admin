import type { INestApplication } from '@nestjs/common';
import { SystemRole, type Group, type PaymentCycle, type Student } from '@kidzzy/shared';
import request from 'supertest';
import type { App } from 'supertest/types';
import { PrismaService } from '../src/modules/prisma/prisma.service';
import { createAcademy, createTestApp, createUser, readCookies, removeAcademy } from './helpers';

// US-36 (SCRUM-39): correct the starting point of a payee's first cycle (BR-14, AC-10). The counter
// is recomputed from cycle_sessions: sessions_counted = openingCount + the sessions counted.

const NOW = new Date('2026-10-22T10:00:00.000Z');
type ErrorResponse = { code: string; errors?: { field: string }[] };

describe('Setting a first cycle’s starting point (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let academyId: string;
  let otherAcademyId: string;
  let adminId: string;
  let ana: string;
  let adminToken: string;
  let anaToken: string;
  let otherAdminToken: string;
  const password = 'correct-horse-1';
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  const mail = (name: string) => `${name}-${stamp}@test.local`;

  const server = () => app.getHttpServer();
  const api = (path: string) => `/api/v1${path}`;
  const as = (token: string) => ({ Cookie: `access_token=${token}` });

  async function login(loginName: string): Promise<string> {
    const res = await request(server())
      .post(api('/auth/login'))
      .send({ login: loginName, password })
      .expect(200);
    return readCookies(res.headers['set-cookie']).access_token.value;
  }

  async function newGroup(): Promise<Group> {
    const res = await request(server())
      .post(api('/groups'))
      .set(as(adminToken))
      .send({
        name: `Start ${Math.random().toString(36).slice(2, 8)}`,
        level: 'Scratch 1',
        instructorId: ana,
        startDate: '2026-10-01',
        schedule: [{ weekday: 4, startTime: '17:00', durationMin: 60 }],
      })
      .expect(201);
    return res.body as Group;
  }

  /** A student enrolled with a plan of N sessions and a starting point; returns their first cycle. */
  async function studentCycle(groupId: string, sessionsPerCycle: number, openingCount = 0) {
    const code = Math.random().toString(36).slice(2, 8).toUpperCase();
    const created = await request(server())
      .post(api('/students'))
      .set(as(adminToken))
      .send({
        code: `S-${code}`,
        name: `Student ${code}`,
        parentName: 'P',
        parentPhone: '01012345678',
      })
      .expect(201);
    const studentId = (created.body as Student).id;
    await request(server())
      .post(api(`/groups/${groupId}/enrollments`))
      .set(as(adminToken))
      .send({
        studentId,
        startDate: '2026-10-01',
        plan: { sessionsPerCycle, amount: '1000.00' },
        openingCount,
      })
      .expect(201);
    const cycle = await prisma.unscoped.paymentCycle.findFirstOrThrow({
      where: { studentId, cycleNumber: 1 },
    });
    return { studentId, cycleId: cycle.id };
  }

  async function instructorCycle(groupId: string, sessionsPerCycle: number, openingCount = 0) {
    await request(server())
      .post(api(`/instructors/${ana}/payment-plans`))
      .set(as(adminToken))
      .send({ groupId, sessionsPerCycle, amount: '2000.00', openingCount })
      .expect(201);
    return (
      await prisma.unscoped.paymentCycle.findFirstOrThrow({
        where: { instructorId: ana, groupId, cycleNumber: 1 },
      })
    ).id;
  }

  /** The group's first sessions, set to past days in order, not yet Held. */
  async function pastSessions(groupId: string, howMany: number) {
    const sessions = (
      await prisma.unscoped.session.findMany({
        where: { groupId },
        orderBy: [{ scheduledAt: 'asc' }, { id: 'asc' }],
      })
    ).slice(0, howMany);
    if (sessions.length < howMany) throw new Error('need more generated sessions');
    for (const [index, session] of sessions.entries()) {
      await prisma.unscoped.session.update({
        where: { id: session.id },
        data: { scheduledAt: new Date(`2026-10-${10 + index}T08:00:00.000Z`) },
      });
    }
    return sessions;
  }

  const hold = (id: string) =>
    request(server())
      .post(api(`/sessions/${id}/held`))
      .set(as(adminToken));
  const setPoint = (cycleId: string, body: unknown, token = adminToken) =>
    request(server())
      .put(api(`/payment-cycles/${cycleId}/starting-point`))
      .set(as(token))
      .send(body as object);
  const cycleRow = (id: string) =>
    prisma.unscoped.paymentCycle.findUniqueOrThrow({ where: { id } });
  const rows = (cycleId: string) => prisma.unscoped.cycleSession.count({ where: { cycleId } });
  const audit = (id: string) =>
    prisma.unscoped.auditLog.findMany({
      where: { entityId: id, action: 'payment_cycle.starting_point_set' },
    });

  beforeAll(async () => {
    app = await createTestApp({ loginRateLimit: 1000, now: NOW });
    prisma = app.get(PrismaService);
    academyId = await createAcademy(prisma, 'starting-point');
    otherAcademyId = await createAcademy(prisma, 'starting-point-other');
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
    adminToken = await login(mail('admin'));
    anaToken = await login(mail('ana'));
    otherAdminToken = await login(mail('other-admin'));
  });

  afterAll(async () => {
    await removeAcademy(prisma, academyId);
    await removeAcademy(prisma, otherAcademyId);
    await app.close();
  });

  describe('a first cycle in progress', () => {
    it('AC-10: N=8 with a starting point of 3 shows 4 of 8 after the next Held session', async () => {
      const group = await newGroup();
      const { cycleId } = await studentCycle(group.id, 8);
      const [session] = await pastSessions(group.id, 1);
      if (!session) throw new Error('need a session');

      const res = await setPoint(cycleId, { openingCount: 3 }).expect(200);
      expect(res.body).toMatchObject({
        id: cycleId,
        cycleNumber: 1,
        sessionsPerCycle: 8,
        openingCount: 3,
        sessionsCounted: 3,
        status: 'in_progress',
      });
      await hold(session.id).expect(200);
      expect(await cycleRow(cycleId)).toMatchObject({ openingCount: 3, sessionsCounted: 4 });
    });

    it('recomputes the counter as the starting point plus the sessions already counted', async () => {
      const group = await newGroup();
      const { cycleId } = await studentCycle(group.id, 8);
      const [first, second] = await pastSessions(group.id, 2);
      if (!first || !second) throw new Error('need two sessions');
      await hold(first.id).expect(200);
      await hold(second.id).expect(200);
      expect(await cycleRow(cycleId)).toMatchObject({ openingCount: 0, sessionsCounted: 2 });

      await setPoint(cycleId, { openingCount: 3 }).expect(200);
      expect(await cycleRow(cycleId)).toMatchObject({ openingCount: 3, sessionsCounted: 5 });
      expect(await rows(cycleId)).toBe(2);

      await setPoint(cycleId, { openingCount: 0 }).expect(200);
      expect(await cycleRow(cycleId)).toMatchObject({ openingCount: 0, sessionsCounted: 2 });
    });

    it('can be set to the value it already has, and to 0', async () => {
      const group = await newGroup();
      const { cycleId } = await studentCycle(group.id, 8, 2);
      await setPoint(cycleId, { openingCount: 2 }).expect(200);
      await setPoint(cycleId, { openingCount: 0 }).expect(200);
      expect(await cycleRow(cycleId)).toMatchObject({ openingCount: 0, sessionsCounted: 0 });
    });

    it('writes an audit entry with the numbers before and after', async () => {
      const group = await newGroup();
      const { cycleId } = await studentCycle(group.id, 8, 1);
      await setPoint(cycleId, { openingCount: 4 }).expect(200);

      const entries = await audit(cycleId);
      expect(entries).toHaveLength(1);
      expect(entries[0]).toMatchObject({
        academyId,
        actorId: adminId,
        entityType: 'payment_cycles',
        entityId: cycleId,
        before: { openingCount: 1, sessionsCounted: 1 },
        after: { openingCount: 4, sessionsCounted: 4 },
      });
    });

    it('works for an instructor’s first cycle of a group, independent of their other groups', async () => {
      const first = await newGroup();
      const second = await newGroup();
      const firstCycle = await instructorCycle(first.id, 8, 1);
      const secondCycle = await instructorCycle(second.id, 4, 2);

      await setPoint(firstCycle, { openingCount: 5 }).expect(200);
      expect(await cycleRow(firstCycle)).toMatchObject({ openingCount: 5, sessionsCounted: 5 });
      expect(await cycleRow(secondCycle)).toMatchObject({ openingCount: 2, sessionsCounted: 2 });
      // N=4 for the second group: its own range, not the other group's.
      await setPoint(secondCycle, { openingCount: 4 }).expect(422);
      await setPoint(secondCycle, { openingCount: 3 }).expect(200);
    });
  });

  describe('the result must stay below N', () => {
    it('refuses a starting point that, with the sessions counted, reaches N (422 on openingCount), changing nothing', async () => {
      const group = await newGroup();
      const { cycleId } = await studentCycle(group.id, 4);
      const [first, second] = await pastSessions(group.id, 2);
      if (!first || !second) throw new Error('need two sessions');
      await hold(first.id).expect(200);
      await hold(second.id).expect(200);

      const res = await setPoint(cycleId, { openingCount: 2 }).expect(422);
      expect(res.body).toMatchObject({
        code: 'STARTING_POINT_OUT_OF_RANGE',
        errors: [{ field: 'openingCount' }],
      });
      expect(await cycleRow(cycleId)).toMatchObject({
        openingCount: 0,
        sessionsCounted: 2,
        status: 'in_progress',
      });
      expect(await audit(cycleId)).toHaveLength(0);
      // One below is fine: 1 + 2 sessions = 3 of 4.
      await setPoint(cycleId, { openingCount: 1 }).expect(200);
      expect(await cycleRow(cycleId)).toMatchObject({ sessionsCounted: 3 });
    });

    it('refuses N itself and more (422), and a negative or non-integer value (400)', async () => {
      const group = await newGroup();
      const { cycleId } = await studentCycle(group.id, 4);

      await setPoint(cycleId, { openingCount: 4 }).expect(422);
      await setPoint(cycleId, { openingCount: 50 }).expect(422);
      for (const body of [
        { openingCount: -1 },
        { openingCount: 1.5 },
        { openingCount: '2' },
        { openingCount: 100 },
        {},
        { openingCount: 1, extra: true },
      ]) {
        await setPoint(cycleId, body).expect(400);
      }
      expect(await cycleRow(cycleId)).toMatchObject({ openingCount: 0 });
    });
  });

  describe('only a first cycle that is in progress (409 STARTING_POINT_LOCKED)', () => {
    it('refuses a later cycle, a Due cycle and a paid cycle', async () => {
      const group = await newGroup();
      const { studentId, cycleId } = await studentCycle(group.id, 2);
      const [first, second] = await pastSessions(group.id, 2);
      if (!first || !second) throw new Error('need two sessions');
      await hold(first.id).expect(200);
      await hold(second.id).expect(200);
      const laterCycle = await prisma.unscoped.paymentCycle.findFirstOrThrow({
        where: { studentId, cycleNumber: 2 },
      });

      // The first cycle is Due now; the second (in progress) is not the first.
      for (const id of [cycleId, laterCycle.id]) {
        const res = await setPoint(id, { openingCount: 1 }).expect(409);
        expect((res.body as ErrorResponse).code).toBe('STARTING_POINT_LOCKED');
      }
      await request(server())
        .post(api(`/payment-cycles/${cycleId}/payments`))
        .set(as(adminToken))
        .send({ amount: '1000.00', paidOn: '2026-10-22', method: 'cash' })
        .expect(201);
      await setPoint(cycleId, { openingCount: 1 }).expect(409);

      expect(await cycleRow(cycleId)).toMatchObject({ openingCount: 0, status: 'paid' });
      expect(await audit(cycleId)).toHaveLength(0);
    });
  });

  describe('who and where', () => {
    it('is 403 for an instructor, 404 for another academy and for an unknown cycle', async () => {
      const group = await newGroup();
      const { cycleId } = await studentCycle(group.id, 8);

      await setPoint(cycleId, { openingCount: 1 }, anaToken).expect(403);
      await setPoint(cycleId, { openingCount: 1 }, otherAdminToken).expect(404);
      await setPoint('0b8c5a3e-1f2d-4c6b-9a7e-3d4f5a6b7c8d', { openingCount: 1 }).expect(404);
      expect(await cycleRow(cycleId)).toMatchObject({ openingCount: 0 });
    });
  });

  describe('at the same time as a Held session', () => {
    it('ends with sessions_counted = openingCount + the cycle’s rows, every time', async () => {
      const group = await newGroup();
      const { cycleId } = await studentCycle(group.id, 20);
      const sessions = await pastSessions(group.id, 4);

      for (const [index, session] of sessions.entries()) {
        const results = await Promise.all([
          hold(session.id),
          setPoint(cycleId, { openingCount: 3 + index }),
        ]);
        expect(results.map((r) => r.status)).toEqual([200, 200]);
        const cycle = await cycleRow(cycleId);
        expect(cycle.sessionsCounted).toBe(cycle.openingCount + (await rows(cycleId)));
        expect(cycle.openingCount).toBe(3 + index);
      }
      expect(await rows(cycleId)).toBe(4);
    });
  });

  it('shows the corrected cycle in the cycles list', async () => {
    const group = await newGroup();
    const { studentId, cycleId } = await studentCycle(group.id, 8);
    await setPoint(cycleId, { openingCount: 6 }).expect(200);

    const res = await request(server())
      .get(api('/payment-cycles'))
      .query({ studentId })
      .set(as(adminToken))
      .expect(200);
    expect((res.body as { data: PaymentCycle[] }).data[0]).toMatchObject({
      openingCount: 6,
      sessionsCounted: 6,
    });
  });
});
