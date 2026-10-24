import type { INestApplication } from '@nestjs/common';
import { SystemRole, type Group, type Session, type Student } from '@kidzzy/shared';
import request from 'supertest';
import type { App } from 'supertest/types';
import { PrismaService } from '../src/modules/prisma/prisma.service';
import { createAcademy, createTestApp, createUser, readCookies, removeAcademy } from './helpers';

// US-17 (SCRUM-41): the admin returns a Held session to Scheduled (BR-13). In one transaction the
// session loses its number, the cycles that counted it take it out, its attendance goes, the later
// Held sessions are renumbered, and the change is written to the audit log.

const NOW = new Date('2026-10-22T10:00:00.000Z');
type ErrorResponse = { code: string };

describe('Undoing a Held session (e2e)', () => {
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

  async function newGroup(instructorId = ana, token = adminToken): Promise<Group> {
    const res = await request(server())
      .post(api('/groups'))
      .set(as(token))
      .send({
        name: `Undo ${Math.random().toString(36).slice(2, 8)}`,
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
        code: `U-${code}`,
        name: `Student ${code}`,
        parentName: 'P',
        parentPhone: '01012345678',
      })
      .expect(201);
    return (res.body as Student).id;
  }

  async function enroll(groupId: string, studentId: string, sessionsPerCycle: number) {
    await request(server())
      .post(api(`/groups/${groupId}/enrollments`))
      .set(as(adminToken))
      .send({
        studentId,
        startDate: '2026-10-01',
        plan: { sessionsPerCycle, amount: '1000.00' },
      })
      .expect(201);
  }

  const instructorPlan = (groupId: string, sessionsPerCycle: number) =>
    request(server())
      .post(api(`/instructors/${ana}/payment-plans`))
      .set(as(adminToken))
      .send({ groupId, sessionsPerCycle, amount: '2000.00' })
      .expect(201);

  /** The group's first sessions, set to past days in order (18th, 19th, …), not yet Held. */
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
        data: { scheduledAt: new Date(`2026-10-${18 + index}T08:00:00.000Z`) },
      });
    }
    return sessions;
  }

  const hold = (id: string) =>
    request(server())
      .post(api(`/sessions/${id}/held`))
      .set(as(adminToken));
  const undo = (id: string, token = adminToken) =>
    request(server())
      .post(api(`/sessions/${id}/undo-held`))
      .set(as(token));
  const row = (id: string) => prisma.unscoped.session.findUniqueOrThrow({ where: { id } });
  const numbersOf = async (groupId: string) =>
    (
      await prisma.unscoped.session.findMany({
        where: { groupId, status: 'held' },
        orderBy: { sessionNumber: 'asc' },
      })
    ).map((s) => s.sessionNumber);
  const audit = (id: string) =>
    prisma.unscoped.auditLog.findMany({ where: { entityId: id, action: 'session.held_undone' } });
  const studentCycles = (studentId: string) =>
    prisma.unscoped.paymentCycle.findMany({
      where: { studentId },
      orderBy: { cycleNumber: 'asc' },
    });
  const instructorCycles = (groupId: string) =>
    prisma.unscoped.paymentCycle.findMany({
      where: { instructorId: ana, groupId },
      orderBy: { cycleNumber: 'asc' },
    });
  const countedRows = (sessionId: string) =>
    prisma.unscoped.cycleSession.count({ where: { sessionId } });

  beforeAll(async () => {
    app = await createTestApp({ loginRateLimit: 1000, now: NOW });
    prisma = app.get(PrismaService);
    academyId = await createAcademy(prisma, 'sessions-undo');
    otherAcademyId = await createAcademy(prisma, 'sessions-undo-other');
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

  it('returns the session to Scheduled, renumbers the later ones, deletes its attendance and writes the audit entry', async () => {
    const group = await newGroup();
    const [first, second, third] = await pastSessions(group.id, 3);
    if (!first || !second || !third) throw new Error('need three sessions');
    const student = await newStudent();
    await enroll(group.id, student, 10);
    for (const session of [first, second, third]) await hold(session.id).expect(200);
    await request(server())
      .put(api(`/sessions/${second.id}/attendance`))
      .set(as(adminToken))
      .send({ records: [{ studentId: student, status: 'present', performanceRating: 4 }] })
      .expect(200);
    expect(await numbersOf(group.id)).toEqual([1, 2, 3]);

    const res = await undo(second.id).expect(200);
    expect(res.body).toMatchObject({ id: second.id, status: 'scheduled', sessionNumber: null });
    expect(res.body).not.toHaveProperty('statusChangedAt');

    expect(await row(first.id)).toMatchObject({ status: 'held', sessionNumber: 1 });
    expect(await row(second.id)).toMatchObject({
      status: 'scheduled',
      sessionNumber: null,
      statusChangedById: adminId,
      statusChangedAt: NOW,
      cancelReason: null,
    });
    expect(await row(third.id)).toMatchObject({ status: 'held', sessionNumber: 2 });
    expect(await prisma.unscoped.attendance.count({ where: { sessionId: second.id } })).toBe(0);

    const entries = await audit(second.id);
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      academyId,
      actorId: adminId,
      entityType: 'sessions',
      entityId: second.id,
      before: { status: 'held', sessionNumber: 2 },
      after: { status: 'scheduled', sessionNumber: null, laterSessionsRenumbered: 1 },
    });
  });

  it('can be marked Held again only when no later session is Held', async () => {
    const group = await newGroup();
    const [first, second, third] = await pastSessions(group.id, 3);
    if (!first || !second || !third) throw new Error('need three sessions');
    for (const session of [first, second, third]) await hold(session.id).expect(200);

    await undo(second.id).expect(200);
    await hold(second.id)
      .expect(409)
      .expect(({ body }) => {
        expect((body as ErrorResponse).code).toBe('SESSION_OUT_OF_ORDER');
      });
    // The later one first, then the session can take its number again.
    await undo(third.id).expect(200);
    const again = await hold(second.id).expect(200);
    expect((again.body as Session).sessionNumber).toBe(2);
    expect(await numbersOf(group.id)).toEqual([1, 2]);
  });

  describe('the cycles', () => {
    it('takes the session out of the student’s and the instructor’s cycles, and a Due cycle returns to In progress', async () => {
      const group = await newGroup();
      await instructorPlan(group.id, 2);
      const student = await newStudent();
      await enroll(group.id, student, 2);
      const [first, second] = await pastSessions(group.id, 2);
      if (!first || !second) throw new Error('need two sessions');
      await hold(first.id).expect(200);
      await hold(second.id).expect(200);
      expect((await studentCycles(student)).map((c) => [c.status, c.sessionsCounted])).toEqual([
        ['due', 2],
        ['in_progress', 0],
      ]);

      await undo(second.id).expect(200);

      for (const cycles of [await studentCycles(student), await instructorCycles(group.id)]) {
        // The cycle opened after the completed one counted nothing, so it is gone.
        expect(cycles).toHaveLength(1);
        expect(cycles[0]).toMatchObject({ status: 'in_progress', sessionsCounted: 1, dueAt: null });
      }
      expect(await countedRows(second.id)).toBe(0);
      expect(await countedRows(first.id)).toBe(2);

      // Marked Held again, they are Due again and the next cycle opens again.
      await hold(second.id).expect(200);
      expect((await studentCycles(student)).map((c) => [c.status, c.sessionsCounted])).toEqual([
        ['due', 2],
        ['in_progress', 0],
      ]);
    });

    it('refuses while a later cycle already counts sessions (409), changing nothing; the newest first then works', async () => {
      const group = await newGroup();
      const student = await newStudent();
      await enroll(group.id, student, 2);
      const [first, second, third] = await pastSessions(group.id, 3);
      if (!first || !second || !third) throw new Error('need three sessions');
      for (const session of [first, second, third]) await hold(session.id).expect(200);
      await request(server())
        .put(api(`/sessions/${first.id}/attendance`))
        .set(as(adminToken))
        .send({ records: [{ studentId: student, status: 'absent' }] })
        .expect(200);
      const before = await studentCycles(student);

      const refused = await undo(first.id).expect(409);
      expect((refused.body as ErrorResponse).code).toBe('SESSION_IN_LATER_CYCLE');
      // Everything stayed: the session, the numbers, the cycles, the attendance, no audit entry.
      expect(await row(first.id)).toMatchObject({ status: 'held', sessionNumber: 1 });
      expect(await numbersOf(group.id)).toEqual([1, 2, 3]);
      expect(await studentCycles(student)).toEqual(before);
      expect(await prisma.unscoped.attendance.count({ where: { sessionId: first.id } })).toBe(1);
      expect(await audit(first.id)).toHaveLength(0);

      await undo(third.id).expect(200);
      await undo(first.id).expect(200);
      const cycles = await studentCycles(student);
      expect(cycles).toHaveLength(1);
      expect(cycles[0]).toMatchObject({ status: 'in_progress', sessionsCounted: 1 });
      expect(await numbersOf(group.id)).toEqual([1]);
      expect((await row(second.id)).sessionNumber).toBe(1);
    });

    it('refuses when a cycle that counted it is already paid (409 CYCLE_ALREADY_PAID), changing nothing', async () => {
      const group = await newGroup();
      await instructorPlan(group.id, 2);
      const [first, second] = await pastSessions(group.id, 2);
      if (!first || !second) throw new Error('need two sessions');
      await hold(first.id).expect(200);
      await hold(second.id).expect(200);
      const [due] = await instructorCycles(group.id);
      await request(server())
        .post(api(`/payment-cycles/${due?.id}/payments`))
        .set(as(adminToken))
        .send({ amount: '2000.00', paidOn: '2026-10-22', method: 'cash' })
        .expect(201);

      const refused = await undo(second.id).expect(409);
      expect((refused.body as ErrorResponse).code).toBe('CYCLE_ALREADY_PAID');
      expect(await row(second.id)).toMatchObject({ status: 'held', sessionNumber: 2 });
      expect((await instructorCycles(group.id))[0]).toMatchObject({
        status: 'paid',
        sessionsCounted: 2,
      });
      expect(await audit(second.id)).toHaveLength(0);
    });
  });

  describe('refusals', () => {
    it('is 409 SESSION_NOT_HELD for a Scheduled and for a Cancelled session', async () => {
      const group = await newGroup();
      const [scheduled, cancelled] = await pastSessions(group.id, 2);
      if (!scheduled || !cancelled) throw new Error('need two sessions');
      await request(server())
        .post(api(`/sessions/${cancelled.id}/cancel`))
        .set(as(adminToken))
        .send({ reason: 'Holiday' })
        .expect(200);

      for (const id of [scheduled.id, cancelled.id]) {
        await undo(id)
          .expect(409)
          .expect(({ body }) => {
            expect((body as ErrorResponse).code).toBe('SESSION_NOT_HELD');
          });
      }
      expect(await audit(scheduled.id)).toHaveLength(0);
    });

    it('is 403 for an instructor, even on their own session, and 404 for another academy and an unknown id', async () => {
      const group = await newGroup();
      const [session] = await pastSessions(group.id, 1);
      if (!session) throw new Error('need a session');
      await hold(session.id).expect(200);

      await undo(session.id, anaToken).expect(403);
      await undo(session.id, otherAdminToken).expect(404);
      await undo('0b8c5a3e-1f2d-4c6b-9a7e-3d4f5a6b7c8d').expect(404);
      expect(await row(session.id)).toMatchObject({ status: 'held' });
    });

    it('two undos of the same session at once: one 200, one 409, one audit entry, numbers intact', async () => {
      const group = await newGroup();
      const [first, second, third] = await pastSessions(group.id, 3);
      if (!first || !second || !third) throw new Error('need three sessions');
      for (const session of [first, second, third]) await hold(session.id).expect(200);

      const results = await Promise.all([undo(second.id), undo(second.id)]);
      expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
      expect(await audit(second.id)).toHaveLength(1);
      // Renumbered once, not twice.
      expect(await numbersOf(group.id)).toEqual([1, 2]);
      expect((await row(third.id)).sessionNumber).toBe(2);
    });
  });
});
