import { Logger, type INestApplication } from '@nestjs/common';
import { SystemRole, type Group, type HeldResult, type Student } from '@kidzzy/shared';
import request from 'supertest';
import type { App } from 'supertest/types';
import { PrismaService } from '../src/modules/prisma/prisma.service';
import { createAcademy, createTestApp, createUser, readCookies, removeAcademy } from './helpers';

// US-22 (SCRUM-38): a Held session is counted into the open cycle of every student whose
// enrollment covers its date and of the instructor on it (BR-06 to BR-08).

const NOW = new Date('2026-10-22T10:00:00.000Z');
type ErrorResponse = { code: string };

describe('Counting Held sessions into payment cycles (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let academyId: string;
  let ana: string;
  let ben: string;
  let adminToken: string;
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

  async function newGroup(instructorId = ana): Promise<Group> {
    const res = await request(server())
      .post(api('/groups'))
      .set(as(adminToken))
      .send({
        name: `Cycles ${Math.random().toString(36).slice(2, 8)}`,
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
        code: `C-${code}`,
        name: `Student ${code}`,
        parentName: 'Parent',
        parentPhone: '01012345678',
      })
      .expect(201);
    return (res.body as Student).id;
  }

  /** Enrolls a student with a plan of N sessions; openingCount is the starting point. */
  async function enroll(
    groupId: string,
    studentId: string,
    sessionsPerCycle: number,
    openingCount = 0,
    startDate = '2026-10-01',
  ) {
    await request(server())
      .post(api(`/groups/${groupId}/enrollments`))
      .set(as(adminToken))
      .send({ studentId, startDate, plan: { sessionsPerCycle, amount: '1000.00' }, openingCount })
      .expect(201);
  }

  async function instructorPlan(instructorId: string, sessionsPerCycle: number, openingCount = 0) {
    await request(server())
      .post(api(`/instructors/${instructorId}/payment-plans`))
      .set(as(adminToken))
      .send({ sessionsPerCycle, amount: '2000.00', openingCount })
      .expect(201);
  }

  async function sessionsOf(groupId: string) {
    return prisma.unscoped.session.findMany({
      where: { groupId },
      orderBy: [{ scheduledAt: 'asc' }, { id: 'asc' }],
    });
  }

  async function setTime(id: string, scheduledAt: string) {
    await prisma.unscoped.session.update({
      where: { id },
      data: { scheduledAt: new Date(scheduledAt) },
    });
  }

  const hold = (id: string) =>
    request(server())
      .post(api(`/sessions/${id}/held`))
      .set(as(adminToken));

  const studentCycles = (studentId: string) =>
    prisma.unscoped.paymentCycle.findMany({
      where: { studentId },
      orderBy: { cycleNumber: 'asc' },
    });
  const instructorCycles = (instructorId: string) =>
    prisma.unscoped.paymentCycle.findMany({
      where: { instructorId },
      orderBy: { cycleNumber: 'asc' },
    });
  const countedRows = (cycleId: string) =>
    prisma.unscoped.cycleSession.count({ where: { cycleId } });

  /** sessions_counted must equal opening_count plus the cycle's rows, for every cycle. */
  async function expectConsistent(
    cycles: { id: string; openingCount: number; sessionsCounted: number }[],
  ) {
    for (const cycle of cycles) {
      expect(cycle.sessionsCounted).toBe(cycle.openingCount + (await countedRows(cycle.id)));
    }
  }

  beforeAll(async () => {
    app = await createTestApp({ loginRateLimit: 1000, now: NOW });
    prisma = app.get(PrismaService);
    academyId = await createAcademy(prisma, 'cycles-counting');
    await createUser(prisma, academyId, {
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
    ben = await createUser(prisma, academyId, {
      name: 'ben',
      email: mail('ben'),
      password,
      role: SystemRole.Instructor,
    });
    adminToken = await login(mail('admin'));
  });

  afterAll(async () => {
    await removeAcademy(prisma, academyId);
    await app.close();
  });

  it('counts the session for each student, present or absent, and for the instructor', async () => {
    const instructor = await createUser(prisma, academyId, {
      name: 'cora',
      email: mail('cora'),
      password,
      role: SystemRole.Instructor,
    });
    await instructorPlan(instructor, 4);
    const group = await newGroup(instructor);
    const [first, second] = await sessionsOf(group.id);
    if (!first || !second) throw new Error('need two sessions');
    await setTime(first.id, '2026-10-20T08:00:00.000Z');
    await setTime(second.id, '2026-10-21T08:00:00.000Z');
    const present = await newStudent();
    const absent = await newStudent();
    await enroll(group.id, present, 4);
    await enroll(group.id, absent, 4);

    const res = await hold(first.id).expect(200);
    const result = res.body as HeldResult;
    expect(result.cyclesUpdated).toHaveLength(3);
    expect(
      result.cyclesUpdated.every((c) => c.sessionsCounted === 1 && c.sessionsPerCycle === 4),
    ).toBe(true);
    expect(result.cyclesUpdated.every((c) => c.status === 'in_progress')).toBe(true);

    // The student is marked absent afterwards: the next session still counts for them (AC-02).
    await request(server())
      .put(api(`/sessions/${first.id}/attendance`))
      .set(as(adminToken))
      .send({
        records: [
          { studentId: absent, status: 'absent' },
          { studentId: present, status: 'present' },
        ],
      })
      .expect(200);
    await hold(second.id).expect(200);

    for (const studentId of [present, absent]) {
      const [cycle] = await studentCycles(studentId);
      expect(cycle).toMatchObject({ sessionsCounted: 2, status: 'in_progress' });
      await expectConsistent([cycle]);
    }
    const [instructorCycle] = await instructorCycles(instructor);
    expect(instructorCycle).toMatchObject({ sessionsCounted: 2 });
  });

  it('turns the cycle Due at N and opens the next one at 0', async () => {
    const instructor = await createUser(prisma, academyId, {
      name: 'dana',
      email: mail('dana'),
      password,
      role: SystemRole.Instructor,
    });
    await instructorPlan(instructor, 2);
    const group = await newGroup(instructor);
    const [a, b, c] = await sessionsOf(group.id);
    if (!a || !b || !c) throw new Error('need three sessions');
    await setTime(a.id, '2026-10-19T08:00:00.000Z');
    await setTime(b.id, '2026-10-20T08:00:00.000Z');
    await setTime(c.id, '2026-10-21T08:00:00.000Z');
    const student = await newStudent();
    await enroll(group.id, student, 2);

    await hold(a.id).expect(200);
    const second = (await hold(b.id).expect(200)).body as HeldResult;
    expect(second.cyclesUpdated.map((c) => c.status)).toEqual(['due', 'due']);
    expect(second.cyclesUpdated.every((c) => c.sessionsCounted === 2)).toBe(true);

    const cycles = await studentCycles(student);
    expect(cycles).toHaveLength(2);
    expect(cycles[0]).toMatchObject({
      cycleNumber: 1,
      status: 'due',
      sessionsCounted: 2,
      dueAt: NOW,
    });
    expect(cycles[1]).toMatchObject({
      cycleNumber: 2,
      status: 'in_progress',
      sessionsCounted: 0,
      openingCount: 0,
      planId: cycles[0]?.planId,
    });

    await hold(c.id).expect(200);
    const after = await studentCycles(student);
    expect(after[1]).toMatchObject({ sessionsCounted: 1, status: 'in_progress' });
    expect(after[0]?.sessionsCounted).toBe(2);
    await expectConsistent(after);
  });

  it('starts the first cycle at the starting point, and only the first', async () => {
    const group = await newGroup(ben);
    const [a, b, c] = await sessionsOf(group.id);
    if (!a || !b || !c) throw new Error('need three sessions');
    await setTime(a.id, '2026-10-19T08:00:00.000Z');
    await setTime(b.id, '2026-10-20T08:00:00.000Z');
    await setTime(c.id, '2026-10-21T08:00:00.000Z');
    const student = await newStudent();
    await enroll(group.id, student, 3, 1);

    await hold(a.id).expect(200);
    expect((await studentCycles(student))[0]).toMatchObject({
      openingCount: 1,
      sessionsCounted: 2,
      status: 'in_progress',
    });
    await hold(b.id).expect(200);
    await hold(c.id).expect(200);
    const cycles = await studentCycles(student);
    expect(cycles[0]).toMatchObject({ openingCount: 1, sessionsCounted: 3, status: 'due' });
    expect(cycles[1]).toMatchObject({ cycleNumber: 2, openingCount: 0, sessionsCounted: 1 });
    await expectConsistent(cycles);
  });

  it('applies a plan change from the next cycle', async () => {
    const group = await newGroup(ben);
    const [a, b] = await sessionsOf(group.id);
    if (!a || !b) throw new Error('need two sessions');
    await setTime(a.id, '2026-10-20T08:00:00.000Z');
    await setTime(b.id, '2026-10-21T08:00:00.000Z');
    const student = await newStudent();
    await enroll(group.id, student, 2);

    await hold(a.id).expect(200);
    await request(server())
      .post(api(`/students/${student}/payment-plans`))
      .set(as(adminToken))
      .send({ sessionsPerCycle: 5, amount: '2500.00' })
      .expect(201);
    expect((await studentCycles(student))[0]?.sessionsPerCycle).toBe(2);
    await hold(b.id).expect(200);

    const [first, next] = await studentCycles(student);
    expect(first).toMatchObject({ sessionsPerCycle: 2, status: 'due' });
    expect(next).toMatchObject({ cycleNumber: 2, sessionsPerCycle: 5, sessionsCounted: 0 });
    expect(next?.planId).not.toBe(first?.planId);
  });

  it('counts a transferred student in the group they were in that day, in one cycle', async () => {
    const oldGroup = await newGroup(ben);
    const newerGroup = await newGroup(ben);
    const student = await newStudent();
    await enroll(oldGroup.id, student, 10);
    await request(server())
      .post(api(`/students/${student}/transfer`))
      .set(as(adminToken))
      .send({ toGroupId: newerGroup.id, effectiveDate: '2026-10-15' })
      .expect(200);
    const [oldDay, oldLate] = await sessionsOf(oldGroup.id);
    const [newDay] = await sessionsOf(newerGroup.id);
    if (!oldDay || !oldLate || !newDay) throw new Error('need sessions');
    await setTime(oldDay.id, '2026-10-08T14:00:00.000Z');
    await setTime(newDay.id, '2026-10-20T14:00:00.000Z');
    // A session of the old group after the transfer: the student is no longer in it.
    await setTime(oldLate.id, '2026-10-21T14:00:00.000Z');

    await hold(oldDay.id).expect(200);
    await hold(newDay.id).expect(200);
    const late = (await hold(oldLate.id).expect(200)).body as HeldResult;

    expect(late.cyclesUpdated.every((c) => c.studentId === null)).toBe(true);
    const cycles = await studentCycles(student);
    expect(cycles).toHaveLength(1);
    expect(cycles[0]).toMatchObject({ sessionsCounted: 2 });
    await expectConsistent(cycles);
  });

  it('skips a payee with no open cycle, warns without personal data, and still marks Held', async () => {
    const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    try {
      const noPlan = await createUser(prisma, academyId, {
        name: 'Secret Teacher Name',
        email: mail('noplan'),
        password,
        role: SystemRole.Instructor,
      });
      const group = await newGroup(noPlan);
      const [session] = await sessionsOf(group.id);
      if (!session) throw new Error('need a session');
      await setTime(session.id, '2026-10-21T08:00:00.000Z');
      const student = await newStudent();
      await enroll(group.id, student, 4);

      const res = await hold(session.id).expect(200);
      const result = res.body as HeldResult;
      expect(result.status).toBe('held');
      expect(result.cyclesUpdated.map((c) => c.studentId)).toEqual([student]);
      expect(await instructorCycles(noPlan)).toHaveLength(0);

      const messages = warn.mock.calls.map((call) => String(call[0]));
      const message = messages.find((m) => m.includes(session.id));
      expect(message).toContain(noPlan);
      expect(message).not.toContain('Secret Teacher Name');
    } finally {
      warn.mockRestore();
    }
  });

  it('does not count a Cancelled session, nor a session marked Held twice', async () => {
    const group = await newGroup(ben);
    const [cancelled, held] = await sessionsOf(group.id);
    if (!cancelled || !held) throw new Error('need two sessions');
    await setTime(cancelled.id, '2026-10-20T08:00:00.000Z');
    await setTime(held.id, '2026-10-21T08:00:00.000Z');
    const student = await newStudent();
    await enroll(group.id, student, 5);

    await request(server())
      .post(api(`/sessions/${cancelled.id}/cancel`))
      .set(as(adminToken))
      .send({ reason: 'Holiday' })
      .expect(200);
    await hold(held.id).expect(200);
    await hold(held.id)
      .expect(409)
      .expect(({ body }) => {
        expect((body as ErrorResponse).code).toBe('SESSION_NOT_SCHEDULED');
      });

    const cycles = await studentCycles(student);
    expect(cycles[0]).toMatchObject({ sessionsCounted: 1 });
    expect(await prisma.unscoped.cycleSession.count({ where: { sessionId: cancelled.id } })).toBe(
      0,
    );
    await expectConsistent(cycles);
  });

  describe('at the same time', () => {
    it('counts two sessions of the same instructor in two groups without losing one', async () => {
      const instructor = await createUser(prisma, academyId, {
        name: 'eve',
        email: mail('eve'),
        password,
        role: SystemRole.Instructor,
      });
      await instructorPlan(instructor, 20);
      const groups = [await newGroup(instructor), await newGroup(instructor)];
      const sessions = [];
      for (const group of groups) {
        const [session] = await sessionsOf(group.id);
        if (!session) throw new Error('need a session');
        await setTime(session.id, '2026-10-21T08:00:00.000Z');
        sessions.push(session);
        await enroll(group.id, await newStudent(), 20);
      }

      const results = await Promise.all(sessions.map((s) => hold(s.id)));
      expect(results.map((r) => r.status)).toEqual([200, 200]);
      const cycles = await instructorCycles(instructor);
      expect(cycles).toHaveLength(1);
      expect(cycles[0]).toMatchObject({ sessionsCounted: 2 });
      await expectConsistent(cycles);
    });

    it('does not deadlock when two sessions share an instructor and a transferred student', async () => {
      const instructor = await createUser(prisma, academyId, {
        name: 'finn',
        email: mail('finn'),
        password,
        role: SystemRole.Instructor,
      });
      await instructorPlan(instructor, 3);
      const oldGroup = await newGroup(instructor);
      const newerGroup = await newGroup(instructor);
      const student = await newStudent();
      await enroll(oldGroup.id, student, 3);
      await request(server())
        .post(api(`/students/${student}/transfer`))
        .set(as(adminToken))
        .send({ toGroupId: newerGroup.id, effectiveDate: '2026-10-15' })
        .expect(200);
      const oldSessions = (await sessionsOf(oldGroup.id)).slice(0, 3);
      const newSessions = (await sessionsOf(newerGroup.id)).slice(0, 3);
      if (oldSessions.length < 3 || newSessions.length < 3)
        throw new Error('need three sessions each');
      for (const [index, session] of oldSessions.entries()) {
        await setTime(session.id, `2026-10-0${index + 5}T08:00:00.000Z`);
      }
      for (const [index, session] of newSessions.entries()) {
        await setTime(session.id, `2026-10-2${index}T08:00:00.000Z`);
      }

      // Each round marks one session of each group at once, swapping who is first.
      for (let round = 0; round < 3; round += 1) {
        const pair = [oldSessions[round], newSessions[round]];
        if (round % 2 === 1) pair.reverse();
        const results = await Promise.all(pair.map((s) => hold(s.id)));
        expect(results.map((r) => r.status)).toEqual([200, 200]);
      }

      // Six sessions, three per cycle: two Due cycles and a third at 0, nothing lost or counted twice.
      for (const cycles of [await studentCycles(student), await instructorCycles(instructor)]) {
        expect(cycles.map((c) => [c.sessionsCounted, c.status])).toEqual([
          [3, 'due'],
          [3, 'due'],
          [0, 'in_progress'],
        ]);
        await expectConsistent(cycles);
      }
    });

    it('moves a concurrent session to the next cycle when another one completed the cycle first', async () => {
      const instructor = await createUser(prisma, academyId, {
        name: 'gus',
        email: mail('gus'),
        password,
        role: SystemRole.Instructor,
      });
      // One session short of N: whichever session is counted first completes the cycle.
      await instructorPlan(instructor, 2, 1);
      const sessions = [];
      for (let index = 0; index < 2; index += 1) {
        const group = await newGroup(instructor);
        const [session] = await sessionsOf(group.id);
        if (!session) throw new Error('need a session');
        await setTime(session.id, '2026-10-21T08:00:00.000Z');
        sessions.push(session);
      }

      const results = await Promise.all(sessions.map((s) => hold(s.id)));
      expect(results.map((r) => r.status)).toEqual([200, 200]);
      const cycles = await instructorCycles(instructor);
      expect(cycles.map((c) => [c.sessionsCounted, c.status])).toEqual([
        [2, 'due'],
        [1, 'in_progress'],
      ]);
      await expectConsistent(cycles);
    });
  });
});
