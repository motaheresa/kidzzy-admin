import type { INestApplication } from '@nestjs/common';
import { SystemRole, type Dashboard } from '@kidzzy/shared';
import request from 'supertest';
import type { App } from 'supertest/types';
import { PrismaService } from '../src/modules/prisma/prisma.service';
import { createAcademy, createTestApp, createUser, readCookies, removeAcademy } from './helpers';

// US-34 (SCRUM-50): the admin dashboard. Cairo is UTC+2 in November, so the local day of
// 2026-11-11 is 2026-11-10T22:00Z up to 2026-11-11T22:00Z (the end excluded), and "this week" is the
// 7 local days from 2026-11-05 through 2026-11-11.
const NOW = new Date('2026-11-10T22:30:00.000Z'); // 2026-11-11 00:30 in Cairo

interface Setup {
  academyId: string;
  adminToken: string;
  anaToken: string;
  anaId: string;
  groupId: string;
}

describe('Dashboard (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  const academies: string[] = [];
  const password = 'correct-horse-1';
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  const mail = (name: string, label: string) => `${name}-${label}-${stamp}@test.local`;
  let count = 0;

  const server = () => app.getHttpServer();
  const api = (path: string) => `/api/v1${path}`;
  const as = (token: string) => ({ Cookie: `access_token=${token}` });

  async function signIn(email: string): Promise<string> {
    const res = await request(server())
      .post(api('/auth/login'))
      .send({ login: email, password })
      .expect(200);
    return readCookies(res.headers['set-cookie']).access_token.value;
  }

  async function newGroup(academyId: string, instructorId: string, name: string) {
    return prisma.unscoped.group.create({
      data: {
        academyId,
        name,
        searchText: name,
        level: 'Scratch 1',
        instructorId,
        startDate: new Date('2026-10-01T00:00:00.000Z'),
      },
    });
  }

  /** A new academy with an admin, an instructor and one group, so each test starts clean. */
  async function setup(label: string): Promise<Setup> {
    const academyId = await createAcademy(prisma, `dashboard-${label}`);
    academies.push(academyId);
    await createUser(prisma, academyId, {
      name: 'admin',
      email: mail('admin', label),
      password,
      role: SystemRole.Admin,
    });
    const anaId = await createUser(prisma, academyId, {
      name: 'ana',
      email: mail('ana', label),
      password,
      role: SystemRole.Instructor,
    });
    const group = await newGroup(academyId, anaId, `Group ${label}`);
    return {
      academyId,
      adminToken: await signIn(mail('admin', label)),
      anaToken: await signIn(mail('ana', label)),
      anaId,
      groupId: group.id,
    };
  }

  function session(
    s: Setup,
    at: string,
    status: 'scheduled' | 'held' | 'cancelled' = 'scheduled',
    extra: Record<string, unknown> = {},
  ) {
    return prisma.unscoped.session.create({
      data: {
        academyId: s.academyId,
        groupId: s.groupId,
        instructorId: s.anaId,
        scheduledAt: new Date(at),
        durationMin: 60,
        status,
        // The database requires a reason on a cancelled session, and none on any other.
        ...(status === 'cancelled' ? { cancelReason: 'test' } : {}),
        ...extra,
      },
    });
  }

  const get = async (token: string) =>
    (await request(server()).get(api('/dashboard')).set(as(token)).expect(200)).body as Dashboard;

  async function newStudent(s: Setup, name: string) {
    count += 1;
    return prisma.unscoped.student.create({
      data: {
        academyId: s.academyId,
        code: `D-${count}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`,
        name,
        nameSearch: name,
        parentName: 'Parent',
        parentPhone: '+201000000000',
      },
    });
  }

  async function makeDue(cycleId: string, dueAt: string) {
    const cycle = await prisma.unscoped.paymentCycle.findUniqueOrThrow({ where: { id: cycleId } });
    await prisma.unscoped.paymentCycle.update({
      where: { id: cycleId },
      data: { status: 'due', sessionsCounted: cycle.sessionsPerCycle, dueAt: new Date(dueAt) },
    });
  }

  /** A student with a plan (through the API) whose cycle is Due since `dueAt`. */
  async function dueStudent(s: Setup, name: string, dueAt: string, amount = '900.00') {
    const student = await newStudent(s, name);
    await request(server())
      .post(api(`/groups/${s.groupId}/enrollments`))
      .set(as(s.adminToken))
      .send({
        studentId: student.id,
        startDate: '2026-10-01',
        plan: { sessionsPerCycle: 4, amount },
      })
      .expect(201);
    const cycle = await prisma.unscoped.paymentCycle.findFirstOrThrow({
      where: { studentId: student.id },
    });
    await makeDue(cycle.id, dueAt);
    return { student, cycleId: cycle.id };
  }

  /** An instructor's plan for a new group, whose cycle is Due since `dueAt`. */
  async function dueInstructor(s: Setup, groupName: string, dueAt: string) {
    const group = await newGroup(s.academyId, s.anaId, groupName);
    await request(server())
      .post(api(`/instructors/${s.anaId}/payment-plans`))
      .set(as(s.adminToken))
      .send({ groupId: group.id, sessionsPerCycle: 4, amount: '1500.00' })
      .expect(201);
    const cycle = await prisma.unscoped.paymentCycle.findFirstOrThrow({
      where: { instructorId: s.anaId, groupId: group.id },
    });
    await makeDue(cycle.id, dueAt);
    return { group, cycleId: cycle.id };
  }

  beforeAll(async () => {
    app = await createTestApp({ loginRateLimit: 1000, now: NOW });
    prisma = app.get(PrismaService);
  });

  afterAll(async () => {
    for (const id of academies) await removeAcademy(prisma, id);
    await app.close();
  });

  describe('access', () => {
    it('is for the admin: an instructor is 403 and a request without a login is 401', async () => {
      const s = await setup('access');
      await get(s.adminToken);
      await request(server()).get(api('/dashboard')).set(as(s.anaToken)).expect(403);
      await request(server()).get(api('/dashboard')).expect(401);
    });

    it('answers every section, empty, for an academy with nothing yet', async () => {
      const s = await setup('empty');
      expect(await get(s.adminToken)).toEqual({
        counts: { sessionsToday: 0, dueCycles: 0, cancelledThisWeek: 0, unmarked: 0 },
        todaySessions: [],
        recentHeld: [],
        dueCycles: { students: [], instructors: [] },
      });
    });
  });

  describe('today and this week around local midnight', () => {
    it('puts 00:00 local in today and 23:59 the day before in yesterday, and the end is excluded', async () => {
      const s = await setup('midnight');
      const yesterday = await session(s, '2026-11-10T21:59:00.000Z'); // 2026-11-10 23:59 local
      const start = await session(s, '2026-11-10T22:00:00.000Z'); // 2026-11-11 00:00 local
      const last = await session(s, '2026-11-11T21:59:00.000Z'); // 2026-11-11 23:59 local
      const tomorrow = await session(s, '2026-11-11T22:00:00.000Z'); // 2026-11-12 00:00 local

      const dashboard = await get(s.adminToken);
      const ids = dashboard.todaySessions.map((row) => row.id);
      expect(ids).toEqual([start.id, last.id]);
      expect(ids).not.toContain(yesterday.id);
      expect(ids).not.toContain(tomorrow.id);
      expect(dashboard.counts.sessionsToday).toBe(2);
    });

    it('lists today in time order with the group and the instructor on the session', async () => {
      const s = await setup('order');
      const other = await createUser(prisma, s.academyId, {
        name: 'omar',
        email: mail('omar', 'order'),
        password,
        role: SystemRole.Instructor,
      });
      const late = await session(s, '2026-11-11T15:00:00.000Z');
      const early = await session(s, '2026-11-11T08:00:00.000Z', 'scheduled', {
        instructorId: other,
      });

      const { todaySessions } = await get(s.adminToken);
      expect(todaySessions.map((row) => row.id)).toEqual([early.id, late.id]);
      expect(todaySessions[0]).toMatchObject({
        group: { id: s.groupId },
        instructorId: other,
        instructorName: 'omar',
        status: 'scheduled',
      });
    });

    it('counts the last 7 local days including today, and not the 8th', async () => {
      const s = await setup('week');
      await session(s, '2026-11-04T21:59:00.000Z', 'cancelled'); // 2026-11-04 23:59 local: the 8th day
      await session(s, '2026-11-04T22:00:00.000Z', 'cancelled'); // 2026-11-05 00:00 local: the first day
      await session(s, '2026-11-08T10:00:00.000Z', 'cancelled');
      await session(s, '2026-11-11T22:00:00.000Z', 'cancelled'); // tomorrow, past the week
      expect((await get(s.adminToken)).counts.cancelledThisWeek).toBe(2);
    });
  });

  describe('counts', () => {
    it('counts a cancelled session this week, not as a session today nor a held one', async () => {
      const s = await setup('cancelled');
      await session(s, '2026-11-11T08:00:00.000Z', 'cancelled', { cancelReason: 'sick' });
      await session(s, '2026-11-11T10:00:00.000Z');

      const dashboard = await get(s.adminToken);
      expect(dashboard.counts.cancelledThisWeek).toBe(1);
      expect(dashboard.counts.sessionsToday).toBe(1);
      expect(dashboard.todaySessions.map((row) => row.status)).toEqual(['cancelled', 'scheduled']);
      expect(dashboard.recentHeld).toEqual([]);
    });

    it('counts a past session that is still Scheduled as unmarked, and nothing else', async () => {
      const s = await setup('unmarked');
      await session(s, '2026-11-09T10:00:00.000Z'); // unmarked
      await session(s, '2026-11-10T22:10:00.000Z'); // started 20 minutes ago, still Scheduled
      await session(s, '2026-11-11T10:00:00.000Z'); // ahead
      await session(s, '2026-11-08T10:00:00.000Z', 'held');
      await session(s, '2026-11-08T12:00:00.000Z', 'cancelled');
      expect((await get(s.adminToken)).counts.unmarked).toBe(2);
    });
  });

  describe('recent held sessions', () => {
    it('shows the last 10 newest first, with attendance and the actual duration', async () => {
      const s = await setup('held');
      const student = await newStudent(s, 'Present');
      const absent = await newStudent(s, 'Absent');
      const held = [];
      for (let day = 1; day <= 11; day += 1) {
        const at = `2026-10-${String(day + 10).padStart(2, '0')}T14:00:00.000Z`;
        held.push(
          await session(s, at, 'held', {
            topic: `Topic ${day}`,
            statusChangedAt: new Date(`2026-10-${String(day + 10).padStart(2, '0')}T16:00:00.000Z`),
          }),
        );
      }
      const newest = held[10];
      await prisma.unscoped.session.update({
        where: { id: newest.id },
        data: {
          actualStartedAt: new Date('2026-10-21T14:05:00.000Z'),
          actualEndedAt: new Date('2026-10-21T15:10:00.000Z'),
        },
      });
      const recordedAt = new Date('2026-10-21T16:00:00.000Z');
      const recordedById = (
        await prisma.unscoped.user.findFirstOrThrow({
          where: { academyId: s.academyId, name: 'admin' },
        })
      ).id;
      for (const [studentId, status] of [
        [student.id, 'present'],
        [absent.id, 'absent'],
      ] as const) {
        await prisma.unscoped.attendance.create({
          data: {
            academyId: s.academyId,
            sessionId: newest.id,
            studentId,
            status,
            recordedById,
            recordedAt,
          },
        });
      }

      const { recentHeld } = await get(s.adminToken);
      expect(recentHeld).toHaveLength(10);
      expect(recentHeld[0]).toEqual({
        sessionId: newest.id,
        scheduledAt: '2026-10-21T14:00:00.000Z',
        group: { id: s.groupId, name: 'Group held' },
        instructor: { id: s.anaId, name: 'ana' },
        topic: 'Topic 11',
        attendance: { present: 1, enrolled: 2 },
        actualDurationMin: 65,
      });
      expect(recentHeld.map((row) => row.topic)).toEqual(
        Array.from({ length: 10 }, (_, index) => `Topic ${11 - index}`),
      );
      // Held before the times existed, and with no attendance rows: null and zero, not an error.
      expect(recentHeld[1]).toMatchObject({
        actualDurationMin: null,
        attendance: { present: 0, enrolled: 0 },
      });
    });
  });

  describe('due cycles', () => {
    it('holds both payee types, oldest due first, amounts as strings and the instructor group', async () => {
      const s = await setup('due');
      await dueStudent(s, 'Newer', '2026-11-09T10:00:00.000Z', '900.00');
      const oldest = await dueStudent(s, 'Older', '2026-11-01T10:00:00.000Z', '1250.50');
      const second = await dueInstructor(s, 'Group B', '2026-11-05T10:00:00.000Z');
      const first = await dueInstructor(s, 'Group A', '2026-11-02T10:00:00.000Z');

      const dashboard = await get(s.adminToken);
      expect(dashboard.counts.dueCycles).toBe(4);
      expect(dashboard.dueCycles.students).toEqual([
        {
          id: oldest.cycleId,
          payeeId: oldest.student.id,
          payeeName: 'Older',
          cycleNumber: 1,
          amount: '1250.50',
          dueAt: '2026-11-01T10:00:00.000Z',
          group: null,
        },
        expect.objectContaining({ payeeName: 'Newer', amount: '900.00', group: null }),
      ]);
      expect(dashboard.dueCycles.instructors).toEqual([
        {
          id: first.cycleId,
          payeeId: s.anaId,
          payeeName: 'ana',
          cycleNumber: 1,
          amount: '1500.00',
          dueAt: '2026-11-02T10:00:00.000Z',
          group: { id: first.group.id, name: 'Group A' },
        },
        expect.objectContaining({
          id: second.cycleId,
          group: { id: second.group.id, name: 'Group B' },
        }),
      ]);
    });

    it('caps each list at 20 and still counts every due cycle', async () => {
      const s = await setup('cap');
      for (let index = 0; index < 21; index += 1) {
        await dueStudent(
          s,
          `Student ${index}`,
          `2026-11-${String(index + 1).padStart(2, '0')}T10:00:00.000Z`,
        );
      }
      const dashboard = await get(s.adminToken);
      expect(dashboard.dueCycles.students).toHaveLength(20);
      expect(dashboard.dueCycles.students[0]?.payeeName).toBe('Student 0');
      expect(dashboard.counts.dueCycles).toBe(21);
    });

    it('leaves out a cycle that is in progress or already paid', async () => {
      const s = await setup('state');
      const student = await newStudent(s, 'Open');
      await request(server())
        .post(api(`/groups/${s.groupId}/enrollments`))
        .set(as(s.adminToken))
        .send({
          studentId: student.id,
          startDate: '2026-10-01',
          plan: { sessionsPerCycle: 4, amount: '900.00' },
        })
        .expect(201);
      expect((await get(s.adminToken)).counts.dueCycles).toBe(0);
    });
  });

  describe('academies', () => {
    it("never shows another academy's rows", async () => {
      const mine = await setup('mine');
      const theirs = await setup('theirs');
      await session(theirs, '2026-11-11T10:00:00.000Z');
      await session(theirs, '2026-11-11T11:00:00.000Z', 'cancelled');
      await session(theirs, '2026-11-09T10:00:00.000Z');
      await session(theirs, '2026-11-08T10:00:00.000Z', 'held', {
        statusChangedAt: new Date('2026-11-08T12:00:00.000Z'),
      });
      await dueStudent(theirs, 'Theirs', '2026-11-01T10:00:00.000Z');
      await dueInstructor(theirs, 'Their group', '2026-11-02T10:00:00.000Z');

      expect(await get(mine.adminToken)).toEqual({
        counts: { sessionsToday: 0, dueCycles: 0, cancelledThisWeek: 0, unmarked: 0 },
        todaySessions: [],
        recentHeld: [],
        dueCycles: { students: [], instructors: [] },
      });
      expect((await get(theirs.adminToken)).counts.dueCycles).toBe(2);
    });
  });
});
