import { Logger, type INestApplication } from '@nestjs/common';
import { SystemRole, type Group, type HeldResult, type Student } from '@kidzzy/shared';
import request from 'supertest';
import type { App } from 'supertest/types';
import { PrismaService } from '../src/modules/prisma/prisma.service';
import { createAcademy, createTestApp, createUser, readCookies, removeAcademy } from './helpers';

// US-22 (SCRUM-38) and SCRUM-72: a Held session is counted into the open cycle of every student
// whose enrollment covers its date, and into the open cycle of the (instructor on the session,
// the session's group) pair: an instructor is paid per group (BR-06 to BR-08, ADR-0015).

const NOW = new Date('2026-10-22T10:00:00.000Z');
type ErrorResponse = { code: string };

describe('Counting Held sessions into payment cycles (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let academyId: string;
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

  async function newInstructor(name: string): Promise<string> {
    return createUser(prisma, academyId, {
      name,
      email: mail(name + Math.random().toString(36).slice(2, 6)),
      password,
      role: SystemRole.Instructor,
    });
  }

  async function newGroup(instructorId: string): Promise<Group> {
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

  /** The instructor's plan for one group: the group's cycle line of that instructor. */
  const instructorPlan = (
    instructorId: string,
    groupId: string,
    sessionsPerCycle: number,
    openingCount = 0,
  ) =>
    request(server())
      .post(api(`/instructors/${instructorId}/payment-plans`))
      .set(as(adminToken))
      .send({ groupId, sessionsPerCycle, amount: '2000.00', openingCount });

  const transfer = (studentId: string, toGroupId: string, effectiveDate: string) =>
    request(server())
      .post(api(`/students/${studentId}/transfer`))
      .set(as(adminToken))
      .send({ toGroupId, effectiveDate })
      .expect(200);

  const changeInstructor = (groupId: string, instructorId: string) =>
    request(server())
      .patch(api(`/groups/${groupId}`))
      .set(as(adminToken))
      .send({ instructorId })
      .expect(200);

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
  /** The cycles of an (instructor, group) pair, or of every group of the instructor. */
  const instructorCycles = (instructorId: string, groupId?: string) =>
    prisma.unscoped.paymentCycle.findMany({
      where: { instructorId, ...(groupId ? { groupId } : {}) },
      orderBy: [{ groupId: 'asc' }, { cycleNumber: 'asc' }],
    });
  const countedRows = (cycleId: string) =>
    prisma.unscoped.cycleSession.count({ where: { cycleId } });
  const countedSessionIds = async (cycleId: string) =>
    (await prisma.unscoped.cycleSession.findMany({ where: { cycleId } }))
      .map((row) => row.sessionId)
      .sort();

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

  it('counts the session for each student, present or absent, and for the instructor in that group', async () => {
    const instructor = await newInstructor('cora');
    const group = await newGroup(instructor);
    await instructorPlan(instructor, group.id, 4).expect(201);
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
    // The instructor's change names the group; a student's does not have one.
    expect(result.cyclesUpdated.map((c) => [c.payeeType, c.groupId]).sort()).toEqual([
      ['instructor', group.id],
      ['student', null],
      ['student', null],
    ]);

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
      const cycles = await studentCycles(studentId);
      expect(cycles[0]).toMatchObject({ sessionsCounted: 2, status: 'in_progress' });
      await expectConsistent(cycles);
    }
    expect((await instructorCycles(instructor, group.id))[0]).toMatchObject({
      sessionsCounted: 2,
      groupId: group.id,
    });
  });

  it('turns the cycle Due at N and opens the next one at 0', async () => {
    const instructor = await newInstructor('dana');
    const group = await newGroup(instructor);
    await instructorPlan(instructor, group.id, 2).expect(201);
    const [a, b, c] = await sessionsOf(group.id);
    if (!a || !b || !c) throw new Error('need three sessions');
    await setTime(a.id, '2026-10-19T08:00:00.000Z');
    await setTime(b.id, '2026-10-20T08:00:00.000Z');
    await setTime(c.id, '2026-10-21T08:00:00.000Z');
    const student = await newStudent();
    await enroll(group.id, student, 2);

    await hold(a.id).expect(200);
    const second = (await hold(b.id).expect(200)).body as HeldResult;
    expect(second.cyclesUpdated.map((cycle) => cycle.status)).toEqual(['due', 'due']);
    expect(second.cyclesUpdated.every((cycle) => cycle.sessionsCounted === 2)).toBe(true);

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
    const pair = await instructorCycles(instructor, group.id);
    expect(pair.map((cycle) => [cycle.cycleNumber, cycle.status, cycle.groupId])).toEqual([
      [1, 'due', group.id],
      [2, 'in_progress', group.id],
    ]);

    await hold(c.id).expect(200);
    const after = await studentCycles(student);
    expect(after[1]).toMatchObject({ sessionsCounted: 1, status: 'in_progress' });
    expect(after[0]?.sessionsCounted).toBe(2);
    await expectConsistent([...after, ...(await instructorCycles(instructor, group.id))]);
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

  it('applies a student’s plan change from the next cycle', async () => {
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
    await transfer(student, newerGroup.id, '2026-10-15');
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
      expect(message).toContain(group.id);
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

  describe('an instructor is paid per group', () => {
    it('two groups of one instructor with N=8 and N=4 reach Due independently, each counting only its own sessions', async () => {
      const instructor = await newInstructor('eve');
      const eight = await newGroup(instructor);
      const four = await newGroup(instructor);
      // Starting points put both groups a few sessions from Due (N=8 at 6, N=4 at 1).
      await instructorPlan(instructor, eight.id, 8, 6).expect(201);
      await instructorPlan(instructor, four.id, 4, 1).expect(201);
      const eightSessions = (await sessionsOf(eight.id)).slice(0, 2);
      const fourSessions = (await sessionsOf(four.id)).slice(0, 3);
      if (eightSessions.length < 2 || fourSessions.length < 3) throw new Error('need sessions');
      for (const [index, session] of eightSessions.entries()) {
        await setTime(session.id, `2026-10-${18 + index}T08:00:00.000Z`);
      }
      for (const [index, session] of fourSessions.entries()) {
        await setTime(session.id, `2026-10-${18 + index}T09:00:00.000Z`);
      }

      for (const session of eightSessions) await hold(session.id).expect(200);
      let eightCycles = await instructorCycles(instructor, eight.id);
      let fourCycles = await instructorCycles(instructor, four.id);
      expect(eightCycles.map((c) => [c.cycleNumber, c.sessionsCounted, c.status])).toEqual([
        [1, 8, 'due'],
        [2, 0, 'in_progress'],
      ]);
      // The other group did not move.
      expect(fourCycles.map((c) => [c.cycleNumber, c.sessionsCounted, c.status])).toEqual([
        [1, 1, 'in_progress'],
      ]);

      for (const session of fourSessions) await hold(session.id).expect(200);
      eightCycles = await instructorCycles(instructor, eight.id);
      fourCycles = await instructorCycles(instructor, four.id);
      expect(fourCycles.map((c) => [c.cycleNumber, c.sessionsCounted, c.status])).toEqual([
        [1, 4, 'due'],
        [2, 0, 'in_progress'],
      ]);
      expect(eightCycles.map((c) => [c.cycleNumber, c.sessionsCounted])).toEqual([
        [1, 8],
        [2, 0],
      ]);
      expect(fourCycles[1]).toMatchObject({ sessionsPerCycle: 4 });
      expect(eightCycles[1]).toMatchObject({ sessionsPerCycle: 8 });

      // A session counts only in the cycle of its own group.
      expect(await countedSessionIds(eightCycles[0]?.id ?? '')).toEqual(
        eightSessions.map((s) => s.id).sort(),
      );
      expect(await countedSessionIds(fourCycles[0]?.id ?? '')).toEqual(
        fourSessions.map((s) => s.id).sort(),
      );
      await expectConsistent([...eightCycles, ...fourCycles]);
    });

    it('applies a plan change of one group from that group’s next cycle, and leaves the other group alone', async () => {
      const instructor = await newInstructor('fay');
      const group = await newGroup(instructor);
      const other = await newGroup(instructor);
      await instructorPlan(instructor, group.id, 2).expect(201);
      await instructorPlan(instructor, other.id, 2).expect(201);
      const [a, b] = await sessionsOf(group.id);
      if (!a || !b) throw new Error('need two sessions');
      await setTime(a.id, '2026-10-20T08:00:00.000Z');
      await setTime(b.id, '2026-10-21T08:00:00.000Z');

      await hold(a.id).expect(200);
      await request(server())
        .post(api(`/instructors/${instructor}/payment-plans`))
        .set(as(adminToken))
        .send({ groupId: group.id, sessionsPerCycle: 5, amount: '2500.00' })
        .expect(201);
      expect((await instructorCycles(instructor, group.id))[0]?.sessionsPerCycle).toBe(2);
      await hold(b.id).expect(200);

      const [first, next] = await instructorCycles(instructor, group.id);
      expect(first).toMatchObject({ sessionsPerCycle: 2, status: 'due' });
      expect(next).toMatchObject({ cycleNumber: 2, sessionsPerCycle: 5, sessionsCounted: 0 });
      expect(next?.planId).not.toBe(first?.planId);
      expect(await instructorCycles(instructor, other.id)).toHaveLength(1);
      expect((await instructorCycles(instructor, other.id))[0]).toMatchObject({
        sessionsPerCycle: 2,
        sessionsCounted: 0,
      });
    });

    it('freezes the former instructor’s cycle when the group changes hands, counts the new one only with a plan, and resumes when the former returns', async () => {
      const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
      try {
        const former = await newInstructor('gus');
        const successor = await newInstructor('hal');
        const group = await newGroup(former);
        await instructorPlan(former, group.id, 3).expect(201);
        const sessions = (await sessionsOf(group.id)).slice(0, 4);
        const [s1, s2, s3, s4] = sessions;
        if (!s1 || !s2 || !s3 || !s4) throw new Error('need four sessions');
        for (const [index, session] of sessions.entries()) {
          await setTime(session.id, `2026-10-1${index + 6}T08:00:00.000Z`);
        }

        await hold(s1.id).expect(200);
        expect((await instructorCycles(former, group.id))[0]).toMatchObject({ sessionsCounted: 1 });

        // The group changes hands. The sessions already in the past stay with the former
        // instructor, so the ones that should go to the successor are moved by hand here (the
        // regeneration only moves sessions still ahead).
        await changeInstructor(group.id, successor);
        await prisma.unscoped.session.updateMany({
          where: { id: { in: [s2.id, s3.id] } },
          data: { instructorId: successor },
        });

        // No plan for the successor in this group yet: the session is skipped with a warning,
        // and the former instructor's cycle takes nothing and stays in progress.
        const skipped = (await hold(s2.id).expect(200)).body as HeldResult;
        expect(skipped.cyclesUpdated.filter((c) => c.payeeType === 'instructor')).toEqual([]);
        expect(warn.mock.calls.some((call) => String(call[0]).includes(successor))).toBe(true);
        expect((await instructorCycles(former, group.id))[0]).toMatchObject({
          sessionsCounted: 1,
          status: 'in_progress',
        });
        expect(await instructorCycles(successor, group.id)).toHaveLength(0);

        // With a plan for the group, the successor is counted in their own cycle.
        await instructorPlan(successor, group.id, 3).expect(201);
        const counted = (await hold(s3.id).expect(200)).body as HeldResult;
        expect(
          counted.cyclesUpdated
            .filter((c) => c.payeeType === 'instructor')
            .map((c) => c.instructorId),
        ).toEqual([successor]);
        expect((await instructorCycles(successor, group.id))[0]).toMatchObject({
          sessionsCounted: 1,
        });
        expect((await instructorCycles(former, group.id))[0]).toMatchObject({
          sessionsCounted: 1,
        });

        // The former instructor comes back: their cycle resumes where it stopped.
        await changeInstructor(group.id, former);
        await prisma.unscoped.session.update({
          where: { id: s4.id },
          data: { instructorId: former },
        });
        await hold(s4.id).expect(200);

        const formerCycles = await instructorCycles(former, group.id);
        const successorCycles = await instructorCycles(successor, group.id);
        expect(formerCycles).toHaveLength(1);
        expect(formerCycles[0]).toMatchObject({ sessionsCounted: 2, status: 'in_progress' });
        expect(await countedSessionIds(formerCycles[0]?.id ?? '')).toEqual([s1.id, s4.id].sort());
        expect(successorCycles[0]).toMatchObject({ sessionsCounted: 1, status: 'in_progress' });
        await expectConsistent([...formerCycles, ...successorCycles]);
      } finally {
        warn.mockRestore();
      }
    });
  });

  describe('at the same time', () => {
    it('counts two sessions of the same instructor and group without losing one', async () => {
      const instructor = await newInstructor('ivy');
      const group = await newGroup(instructor);
      await instructorPlan(instructor, group.id, 20).expect(201);
      const [a, b] = await sessionsOf(group.id);
      if (!a || !b) throw new Error('need two sessions');
      // The same instant, so neither session is "earlier" than the other (SESSION_OUT_OF_ORDER).
      await setTime(a.id, '2026-10-21T08:00:00.000Z');
      await setTime(b.id, '2026-10-21T08:00:00.000Z');
      await enroll(group.id, await newStudent(), 20);

      const results = await Promise.all([hold(a.id), hold(b.id)]);
      expect(results.map((r) => r.status)).toEqual([200, 200]);
      const cycles = await instructorCycles(instructor, group.id);
      expect(cycles).toHaveLength(1);
      expect(cycles[0]).toMatchObject({ sessionsCounted: 2 });
      await expectConsistent(cycles);
    });

    it('does not deadlock when two sessions share two transferred students', async () => {
      const instructor = await newInstructor('jon');
      const oldGroup = await newGroup(instructor);
      const newerGroup = await newGroup(instructor);
      await instructorPlan(instructor, oldGroup.id, 3).expect(201);
      await instructorPlan(instructor, newerGroup.id, 3).expect(201);
      const students = [await newStudent(), await newStudent()];
      for (const student of students) {
        await enroll(oldGroup.id, student, 3);
        await transfer(student, newerGroup.id, '2026-10-15');
      }
      const oldSessions = (await sessionsOf(oldGroup.id)).slice(0, 3);
      const newSessions = (await sessionsOf(newerGroup.id)).slice(0, 3);
      if (oldSessions.length < 3 || newSessions.length < 3) {
        throw new Error('need three sessions each');
      }
      for (const [index, session] of oldSessions.entries()) {
        await setTime(session.id, `2026-10-0${index + 5}T08:00:00.000Z`);
      }
      for (const [index, session] of newSessions.entries()) {
        await setTime(session.id, `2026-10-2${index}T08:00:00.000Z`);
      }

      // Each round marks one session of each group at once, swapping who is first. Both
      // sessions touch the same two students' cycles, which the lock takes in id order.
      for (let round = 0; round < 3; round += 1) {
        const pair = [oldSessions[round], newSessions[round]];
        if (round % 2 === 1) pair.reverse();
        const results = await Promise.all(pair.map((s) => hold(s?.id ?? '')));
        expect(results.map((r) => r.status)).toEqual([200, 200]);
      }

      // Six sessions, three per cycle: two Due cycles and a third at 0, nothing lost or counted twice.
      for (const student of students) {
        const cycles = await studentCycles(student);
        expect(cycles.map((c) => [c.sessionsCounted, c.status])).toEqual([
          [3, 'due'],
          [3, 'due'],
          [0, 'in_progress'],
        ]);
        await expectConsistent(cycles);
      }
      // Each group's pair got its own three sessions.
      for (const group of [oldGroup, newerGroup]) {
        const cycles = await instructorCycles(instructor, group.id);
        expect(cycles.map((c) => [c.sessionsCounted, c.status])).toEqual([
          [3, 'due'],
          [0, 'in_progress'],
        ]);
        await expectConsistent(cycles);
      }
    });

    it('moves a concurrent session to the next cycle when another one completed the shared cycle first', async () => {
      const instructor = await newInstructor('kim');
      const oldGroup = await newGroup(instructor);
      const newerGroup = await newGroup(instructor);
      const student = await newStudent();
      // One session short of N: whichever session is counted first completes the cycle.
      await enroll(oldGroup.id, student, 2, 1);
      await transfer(student, newerGroup.id, '2026-10-15');
      const [oldSession] = await sessionsOf(oldGroup.id);
      const [newSession] = await sessionsOf(newerGroup.id);
      if (!oldSession || !newSession) throw new Error('need sessions');
      await setTime(oldSession.id, '2026-10-08T08:00:00.000Z');
      await setTime(newSession.id, '2026-10-20T08:00:00.000Z');

      const results = await Promise.all([hold(oldSession.id), hold(newSession.id)]);
      expect(results.map((r) => r.status)).toEqual([200, 200]);
      const cycles = await studentCycles(student);
      expect(cycles.map((c) => [c.sessionsCounted, c.status])).toEqual([
        [2, 'due'],
        [1, 'in_progress'],
      ]);
      await expectConsistent(cycles);
    });
  });
});
