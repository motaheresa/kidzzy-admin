import type { INestApplication } from '@nestjs/common';
import { SystemRole, type AuditLog, type Group, type Student } from '@kidzzy/shared';
import request from 'supertest';
import type { App } from 'supertest/types';
import { AuditRepository } from '../src/modules/audit/audit.repository';
import { PrismaService } from '../src/modules/prisma/prisma.service';
import { createAcademy, createTestApp, createUser, readCookies, removeAcademy } from './helpers';

const NOW = new Date('2026-10-22T10:00:00.000Z');

describe('The audit log (e2e)', () => {
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

  beforeAll(async () => {
    app = await createTestApp({ loginRateLimit: 1000, now: NOW });
    prisma = app.get(PrismaService);
    academyId = await createAcademy(prisma, 'audit-log');
    otherAcademyId = await createAcademy(prisma, 'audit-log-other');

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
    await createUser(prisma, otherAcademyId, {
      name: 'other-instructor',
      email: mail('other-instructor'),
      password,
      role: SystemRole.Instructor,
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

  const entries = (entityId: string, action?: string) =>
    prisma.unscoped.auditLog.findMany({
      where: { entityId, ...(action ? { action } : {}) },
      orderBy: { createdAt: 'asc' },
    });

  async function newGroup(instructorId = ana): Promise<Group> {
    const res = await request(server())
      .post(api('/groups'))
      .set(as(adminToken))
      .send({
        name: `Audit ${Math.random().toString(36).slice(2, 8)}`,
        level: 'Scratch 1',
        instructorId,
        startDate: '2026-10-01',
        schedule: [{ weekday: 4, startTime: '17:00', durationMin: 60 }],
      })
      .expect(201);
    return res.body as Group;
  }

  async function newStudent(): Promise<string> {
    const code = Math.random().toString(36).slice(2, 8).toUpperCase();
    const res = await request(server())
      .post(api('/students'))
      .set(as(adminToken))
      .send({
        code: `A-${code}`,
        name: `Student ${code}`,
        parentName: 'P',
        parentPhone: '01012345678',
      })
      .expect(201);
    return (res.body as Student).id;
  }

  const enroll = (groupId: string, studentId: string, sessionsPerCycle = 8, openingCount = 2) =>
    request(server())
      .post(api(`/groups/${groupId}/enrollments`))
      .set(as(adminToken))
      .send({
        studentId,
        startDate: '2026-10-01',
        plan: { sessionsPerCycle, amount: '1000.00' },
        openingCount,
      });

  async function firstSession(groupId: string) {
    const [session] = await prisma.unscoped.session.findMany({
      where: { groupId },
      orderBy: [{ scheduledAt: 'asc' }, { id: 'asc' }],
    });
    if (!session) throw new Error('expected a generated session');
    return session;
  }

  const hold = (id: string, token = adminToken) =>
    request(server())
      .post(api(`/sessions/${id}/held`))
      .set(as(token));
  const cancel = (id: string, token = adminToken) =>
    request(server())
      .post(api(`/sessions/${id}/cancel`))
      .set(as(token))
      .send({ reason: 'Instructor ill' });
  const list = (query: Record<string, string | number> = {}, token = adminToken) =>
    request(server()).get(api('/audit-logs')).query(query).set(as(token));

  describe('the events', () => {
    it('session.held: status, number and the counters of the cycles it counted into', async () => {
      const group = await newGroup();
      const studentId = await newStudent();
      await enroll(group.id, studentId, 8, 2).expect(201);
      await request(server())
        .post(api(`/instructors/${ana}/payment-plans`))
        .set(as(adminToken))
        .send({ groupId: group.id, sessionsPerCycle: 4, amount: '2000.00', openingCount: 1 })
        .expect(201);
      const session = await firstSession(group.id);

      await hold(session.id).expect(200);

      const [entry] = await entries(session.id, 'session.held');
      const studentCycle = await prisma.unscoped.paymentCycle.findFirstOrThrow({
        where: { studentId, cycleNumber: 1 },
      });
      const instructorCycle = await prisma.unscoped.paymentCycle.findFirstOrThrow({
        where: { instructorId: ana, groupId: group.id, cycleNumber: 1 },
      });
      expect(entry).toMatchObject({
        academyId,
        actorId: adminId,
        entityType: 'sessions',
        before: { status: 'scheduled', sessionNumber: null },
        after: { status: 'held', sessionNumber: 1 },
      });
      const byId = (cycles: unknown) =>
        Object.fromEntries((cycles as { cycleId: string }[]).map((c) => [c.cycleId, c]));
      const before = byId((entry?.before as { cycles: unknown }).cycles);
      const after = byId((entry?.after as { cycles: unknown }).cycles);
      expect(before[studentCycle.id]).toMatchObject({ sessionsCounted: 2, status: 'in_progress' });
      expect(after[studentCycle.id]).toMatchObject({ sessionsCounted: 3, status: 'in_progress' });
      expect(before[instructorCycle.id]).toMatchObject({ sessionsCounted: 1 });
      expect(after[instructorCycle.id]).toMatchObject({ sessionsCounted: 2 });
    });

    it('session.cancelled: the status and the reason', async () => {
      const group = await newGroup();
      const session = await firstSession(group.id);
      await cancel(session.id, anaToken).expect(200);

      const [entry] = await entries(session.id, 'session.cancelled');
      expect(entry).toMatchObject({
        actorId: ana,
        entityType: 'sessions',
        before: { status: 'scheduled' },
        after: { status: 'cancelled', cancelReason: 'Instructor ill' },
      });
    });

    it('payment.recorded: the cycle, the money and the cycle’s status before and after', async () => {
      const group = await newGroup();
      const studentId = await newStudent();
      await enroll(group.id, studentId, 1, 0).expect(201);
      const session = await firstSession(group.id);
      await hold(session.id).expect(200);
      const cycle = await prisma.unscoped.paymentCycle.findFirstOrThrow({
        where: { studentId, cycleNumber: 1 },
      });
      expect(cycle.status).toBe('due');

      const res = await request(server())
        .post(api(`/payment-cycles/${cycle.id}/payments`))
        .set(as(adminToken))
        .send({ amount: '1000.00', paidOn: '2026-10-21', method: 'transfer', note: 'private' })
        .expect(201);

      const [entry] = await entries(cycle.id, 'payment.recorded');
      expect(entry).toMatchObject({
        actorId: adminId,
        entityType: 'payment_cycles',
        before: { cycleStatus: 'due' },
        after: {
          cycleStatus: 'paid',
          paymentId: (res.body as { id: string }).id,
          amount: '1000.00',
          paidOn: '2026-10-21',
          method: 'transfer',
        },
      });
      // The free-text note stays out of the log.
      expect(JSON.stringify(entry?.after)).not.toContain('private');
    });

    it('payment_plan.set and payment_plan.changed, for a student', async () => {
      const group = await newGroup();
      const studentId = await newStudent();
      await enroll(group.id, studentId, 8, 2).expect(201);
      const first = await prisma.unscoped.paymentPlan.findFirstOrThrow({
        where: { studentId, version: 1 },
      });
      const [set] = await entries(first.id, 'payment_plan.set');
      expect(set).toMatchObject({
        entityType: 'payment_plans',
        after: {
          payeeType: 'student',
          studentId,
          version: 1,
          sessionsPerCycle: 8,
          amount: '1000.00',
          effectiveFromCycle: 1,
          openingCount: 2,
        },
      });

      await request(server())
        .post(api(`/students/${studentId}/payment-plans`))
        .set(as(adminToken))
        .send({ sessionsPerCycle: 12, amount: '1500.00' })
        .expect(201);
      const second = await prisma.unscoped.paymentPlan.findFirstOrThrow({
        where: { studentId, version: 2 },
      });
      const [changed] = await entries(second.id, 'payment_plan.changed');
      expect(changed).toMatchObject({
        before: { version: 1, sessionsPerCycle: 8, amount: '1000.00' },
        after: { version: 2, sessionsPerCycle: 12, amount: '1500.00', effectiveFromCycle: 2 },
      });
    });

    it('payment_plan.changed through a re-enrollment with another plan', async () => {
      const group = await newGroup();
      const studentId = await newStudent();
      await enroll(group.id, studentId, 8, 0).expect(201);
      await request(server())
        .post(api(`/students/${studentId}/deactivate`))
        .set(as(adminToken))
        .expect(200);
      await prisma.unscoped.student.update({ where: { id: studentId }, data: { isActive: true } });
      await request(server())
        .post(api(`/groups/${group.id}/enrollments`))
        .set(as(adminToken))
        .send({
          studentId,
          startDate: '2026-10-22',
          plan: { sessionsPerCycle: 10, amount: '1200.00' },
        })
        .expect(201);

      const second = await prisma.unscoped.paymentPlan.findFirstOrThrow({
        where: { studentId, version: 2 },
      });
      const [changed] = await entries(second.id, 'payment_plan.changed');
      expect(changed).toMatchObject({
        before: { version: 1, sessionsPerCycle: 8 },
        after: { version: 2, sessionsPerCycle: 10, amount: '1200.00' },
      });
    });

    it('payment_plan.set and payment_plan.changed, for an instructor and a group', async () => {
      const group = await newGroup();
      await request(server())
        .post(api(`/instructors/${ana}/payment-plans`))
        .set(as(adminToken))
        .send({ groupId: group.id, sessionsPerCycle: 4, amount: '2000.00', openingCount: 1 })
        .expect(201);
      const first = await prisma.unscoped.paymentPlan.findFirstOrThrow({
        where: { instructorId: ana, groupId: group.id, version: 1 },
      });
      const [set] = await entries(first.id, 'payment_plan.set');
      expect(set).toMatchObject({
        after: {
          payeeType: 'instructor',
          instructorId: ana,
          groupId: group.id,
          version: 1,
          sessionsPerCycle: 4,
          amount: '2000.00',
          openingCount: 1,
        },
      });

      await request(server())
        .post(api(`/instructors/${ana}/payment-plans`))
        .set(as(adminToken))
        .send({ groupId: group.id, sessionsPerCycle: 6, amount: '2500.00' })
        .expect(201);
      const second = await prisma.unscoped.paymentPlan.findFirstOrThrow({
        where: { instructorId: ana, groupId: group.id, version: 2 },
      });
      const [changed] = await entries(second.id, 'payment_plan.changed');
      expect(changed).toMatchObject({
        before: { version: 1, sessionsPerCycle: 4, amount: '2000.00' },
        after: { version: 2, sessionsPerCycle: 6, amount: '2500.00', groupId: group.id },
      });
    });

    it('enrollment.transferred: the group left, the group joined and the dates', async () => {
      const from = await newGroup();
      const to = await newGroup();
      const studentId = await newStudent();
      await enroll(from.id, studentId).expect(201);

      await request(server())
        .post(api(`/students/${studentId}/transfer`))
        .set(as(adminToken))
        .send({ toGroupId: to.id, effectiveDate: '2026-10-15' })
        .expect(200);

      const [entry] = await entries(studentId, 'enrollment.transferred');
      expect(entry).toMatchObject({
        actorId: adminId,
        entityType: 'students',
        before: { groupId: from.id, startDate: '2026-10-01', endDate: null },
        after: { groupId: to.id, startDate: '2026-10-15', previousGroupEndDate: '2026-10-14' },
      });
    });

    it('enrollment.ended when a deactivation ends an enrollment, and nothing when there was none', async () => {
      const group = await newGroup();
      const studentId = await newStudent();
      await enroll(group.id, studentId).expect(201);

      await request(server())
        .post(api(`/students/${studentId}/deactivate`))
        .set(as(adminToken))
        .expect(200);
      const [entry] = await entries(studentId, 'enrollment.ended');
      expect(entry).toMatchObject({
        entityType: 'students',
        before: { groupId: group.id, startDate: '2026-10-01', endDate: null },
        after: { groupId: group.id, endDate: '2026-10-21' },
      });

      // Deactivating again has no open enrollment to end, so no second entry.
      await request(server())
        .post(api(`/students/${studentId}/deactivate`))
        .set(as(adminToken))
        .expect(200);
      expect(await entries(studentId, 'enrollment.ended')).toHaveLength(1);
    });
  });

  describe('a change that does not happen leaves no entry', () => {
    it('writes nothing for a refused change', async () => {
      const group = await newGroup();
      const session = await firstSession(group.id);
      await cancel(session.id).expect(200);
      expect(await entries(session.id)).toHaveLength(1);

      await hold(session.id).expect(409);
      await cancel(session.id).expect(409);
      expect(await entries(session.id)).toHaveLength(1);
    });

    it('rolls the change back when the entry cannot be written', async () => {
      const group = await newGroup();
      const session = await firstSession(group.id);
      const spy = jest
        .spyOn(app.get(AuditRepository), 'record')
        .mockRejectedValueOnce(new Error('the log is down'));

      await cancel(session.id).expect(500);

      spy.mockRestore();
      const row = await prisma.unscoped.session.findUniqueOrThrow({ where: { id: session.id } });
      expect(row.status).toBe('scheduled');
      expect(await entries(session.id)).toHaveLength(0);
    });
  });

  describe('GET /audit-logs', () => {
    it('lists the newest first with the actor as { id, name }', async () => {
      const group = await newGroup();
      const session = await firstSession(group.id);
      await request(server())
        .post(api(`/sessions/${session.id}/reschedule`))
        .set(as(anaToken))
        .send({ scheduledAt: '2026-11-05T09:30:00.000Z' })
        .expect(200);
      await cancel(session.id, anaToken).expect(200);

      const res = await list({ entityId: session.id }).expect(200);
      const body = res.body as { data: AuditLog[]; meta: { total: number } };
      expect(body.data.map((e) => e.action)).toEqual(['session.cancelled', 'session.rescheduled']);
      expect(body.data[0]).toMatchObject({
        actor: { id: ana, name: 'ana' },
        entityType: 'sessions',
        entityId: session.id,
        before: { status: 'scheduled' },
        after: { status: 'cancelled', cancelReason: 'Instructor ill' },
      });
      expect(Object.keys(body.data[0] ?? {}).sort()).toEqual(
        ['action', 'actor', 'after', 'before', 'createdAt', 'entityId', 'entityType', 'id'].sort(),
      );
      expect(body.meta.total).toBe(2);
    });

    it('filters by entity type, entity, actor and a date range (from inclusive, to exclusive)', async () => {
      const group = await newGroup();
      const first = await firstSession(group.id);
      await cancel(first.id, anaToken).expect(200);
      const studentId = await newStudent();
      await enroll(group.id, studentId).expect(201);

      const byType = await list({ entityType: 'payment_plans', actorId: adminId, pageSize: 100 });
      expect(
        (byType.body as { data: AuditLog[] }).data.every((e) => e.entityType === 'payment_plans'),
      ).toBe(true);
      const byActor = await list({ entityId: first.id, actorId: ana }).expect(200);
      expect((byActor.body as { data: AuditLog[] }).data).toHaveLength(1);
      const wrongActor = await list({ entityId: first.id, actorId: adminId }).expect(200);
      expect((wrongActor.body as { data: AuditLog[] }).data).toHaveLength(0);

      const [entry] = await entries(first.id);
      if (!entry) throw new Error('expected an entry');
      const at = entry.createdAt;
      const bounds = async (from?: Date, to?: Date) => {
        const res = await list({
          entityId: first.id,
          ...(from ? { from: from.toISOString() } : {}),
          ...(to ? { to: to.toISOString() } : {}),
        }).expect(200);
        return (res.body as { data: AuditLog[] }).data.length;
      };
      expect(await bounds(at, undefined)).toBe(1);
      expect(await bounds(new Date(at.getTime() + 1), undefined)).toBe(0);
      expect(await bounds(undefined, at)).toBe(0);
      expect(await bounds(undefined, new Date(at.getTime() + 1))).toBe(1);
    });

    it('pages the results and reports the total', async () => {
      const group = await newGroup();
      const studentId = await newStudent();
      await enroll(group.id, studentId).expect(201);
      for (const weekday of [1, 2, 3]) {
        await request(server())
          .post(api(`/students/${studentId}/payment-plans`))
          .set(as(adminToken))
          .send({ sessionsPerCycle: 8 + weekday, amount: '1000.00' })
          .expect(201);
      }
      const query = { entityType: 'payment_plans', actorId: adminId };
      const all = await list({ ...query, pageSize: 100 }).expect(200);
      const total = (all.body as { meta: { total: number } }).meta.total;
      expect(total).toBeGreaterThanOrEqual(4);

      const pageOne = await list({ ...query, page: 1, pageSize: 2 }).expect(200);
      const pageTwo = await list({ ...query, page: 2, pageSize: 2 }).expect(200);
      const one = pageOne.body as { data: AuditLog[]; meta: { total: number; pageSize: number } };
      const two = pageTwo.body as { data: AuditLog[] };
      expect(one.data).toHaveLength(2);
      expect(one.meta).toMatchObject({ page: 1, pageSize: 2, total });
      const ids = (all.body as { data: AuditLog[] }).data.map((e) => e.id);
      expect([...one.data, ...two.data].map((e) => e.id)).toEqual(ids.slice(0, 4));
    });

    it('is 400 for from >= to, a bad instant, a bad id and a bad page size', async () => {
      await list({ from: '2026-10-22T10:00:00.000Z', to: '2026-10-22T10:00:00.000Z' }).expect(400);
      await list({ from: '2026-10-23T10:00:00.000Z', to: '2026-10-22T10:00:00.000Z' }).expect(400);
      await list({ from: 'yesterday' }).expect(400);
      await list({ entityId: 'not-a-uuid' }).expect(400);
      await list({ actorId: 'not-a-uuid' }).expect(400);
      await list({ pageSize: 101 }).expect(400);
    });

    it('is 403 for an instructor', async () => {
      await list({}, anaToken).expect(403);
    });

    it('never shows another academy’s entries', async () => {
      const group = await newGroup();
      const session = await firstSession(group.id);
      await cancel(session.id).expect(200);

      const mine = await list({ entityId: session.id }).expect(200);
      expect((mine.body as { data: AuditLog[] }).data).toHaveLength(1);
      const theirs = await list({ entityId: session.id }, otherAdminToken).expect(200);
      expect((theirs.body as { data: AuditLog[] }).data).toHaveLength(0);
      const all = await list({ pageSize: 100 }, otherAdminToken).expect(200);
      expect((all.body as { data: AuditLog[] }).data.every((e) => e.actor.id !== adminId)).toBe(
        true,
      );
    });
  });
});
