import type { INestApplication } from '@nestjs/common';
import {
  SystemRole,
  type Group,
  type GroupAttendance,
  type Page,
  type StudentAttendanceItem,
} from '@kidzzy/shared';
import request from 'supertest';
import type { App } from 'supertest/types';
import { PrismaService } from '../src/modules/prisma/prisma.service';
import { createAcademy, createTestApp, createUser, readCookies, removeAcademy } from './helpers';

const NOW = new Date('2026-10-22T10:00:00.000Z');
type ErrorResponse = { code: string };

describe('Attendance views (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let academyId: string;
  let otherAcademyId: string;
  let ana: string;
  let ben: string;
  let otherInstructor: string;
  let adminToken: string;
  let anaToken: string;
  let benToken: string;
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
        name: `Views ${Math.random().toString(36).slice(2, 8)}`,
        level: 'Scratch 1',
        instructorId,
        startDate: '2026-10-01',
        schedule: [{ weekday: 4, startTime: '17:00', durationMin: 60 }],
      })
      .expect(201);
    return res.body as Group;
  }

  async function sessionsOf(groupId: string) {
    return prisma.unscoped.session.findMany({
      where: { groupId },
      orderBy: [{ scheduledAt: 'asc' }, { id: 'asc' }],
    });
  }

  /** Makes a session Held at a time, straight in the database (the API only holds past ones). */
  async function hold(
    id: string,
    scheduledAt: string,
    sessionNumber: number,
    instructorId?: string,
  ) {
    await prisma.unscoped.session.update({
      where: { id },
      data: {
        status: 'held',
        sessionNumber,
        scheduledAt: new Date(scheduledAt),
        ...(instructorId ? { instructorId } : {}),
      },
    });
  }

  async function newStudent(name: string): Promise<string> {
    const student = await prisma.unscoped.student.create({
      data: {
        academyId,
        code: `KC-${Math.random().toString(36).slice(2, 8).toUpperCase()}`,
        name,
        nameSearch: name.toLowerCase(),
        parentName: 'Parent',
        parentPhone: '+201000000000',
      },
    });
    return student.id;
  }

  async function enroll(studentId: string, groupId: string, startDate: string, endDate?: string) {
    await prisma.unscoped.enrollment.create({
      data: {
        academyId,
        studentId,
        groupId,
        startDate: new Date(`${startDate}T00:00:00.000Z`),
        endDate: endDate ? new Date(`${endDate}T00:00:00.000Z`) : null,
      },
    });
  }

  async function record(
    sessionId: string,
    studentId: string,
    status: 'present' | 'absent',
    performanceRating: number | null = null,
    homeworkRating: number | null = null,
  ) {
    await prisma.unscoped.attendance.create({
      data: {
        academyId,
        sessionId,
        studentId,
        status,
        performanceRating,
        homeworkRating,
        recordedById: ana,
        recordedAt: NOW,
      },
    });
  }

  const grid = (groupId: string, query = '', token = adminToken) =>
    request(server())
      .get(api(`/groups/${groupId}/attendance${query}`))
      .set(as(token));
  const history = (studentId: string, query = '', token = adminToken) =>
    request(server())
      .get(api(`/students/${studentId}/attendance${query}`))
      .set(as(token));

  beforeAll(async () => {
    app = await createTestApp({ loginRateLimit: 1000, now: NOW });
    prisma = app.get(PrismaService);
    academyId = await createAcademy(prisma, 'attendance-views');
    otherAcademyId = await createAcademy(prisma, 'attendance-views-other');

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
    await createUser(prisma, otherAcademyId, {
      name: 'other-admin',
      email: mail('other-admin'),
      password,
      role: SystemRole.Admin,
    });
    otherInstructor = await createUser(prisma, otherAcademyId, {
      name: 'other-instructor',
      email: mail('other-instructor'),
      password,
      role: SystemRole.Instructor,
    });

    adminToken = await login(mail('admin'));
    anaToken = await login(mail('ana'));
    benToken = await login(mail('ben'));
    otherAdminToken = await login(mail('other-admin'));
  });

  afterAll(async () => {
    await removeAcademy(prisma, academyId);
    await removeAcademy(prisma, otherAcademyId);
    await app.close();
  });

  describe('the group grid', () => {
    it('lists only Held sessions, with a cell only where something was recorded', async () => {
      const group = await newGroup();
      const [first, second, scheduled, cancelled] = await sessionsOf(group.id);
      if (!first || !second || !scheduled || !cancelled) throw new Error('need four sessions');
      await hold(first.id, '2026-10-08T14:00:00.000Z', 1);
      await hold(second.id, '2026-10-15T14:00:00.000Z', 2);
      await prisma.unscoped.session.update({
        where: { id: cancelled.id },
        data: { status: 'cancelled', cancelReason: 'Holiday' },
      });
      const zed = await newStudent('Zed');
      const amal = await newStudent('Amal');
      for (const id of [zed, amal]) await enroll(id, group.id, '2026-10-01');
      await record(first.id, amal, 'present', 5, null);
      await record(first.id, zed, 'absent');
      await record(second.id, amal, 'present', 3, 4);

      const res = await grid(group.id).expect(200);
      const body = res.body as GroupAttendance;
      expect(body.sessions.map((s) => s.id)).toEqual([first.id, second.id]);
      expect(body.sessions.every((s) => s.status === 'held')).toBe(true);
      expect(body.students.map((s) => s.student.name)).toEqual(['Amal', 'Zed']);
      expect(body.students[0]?.records).toEqual([
        { sessionId: first.id, status: 'present', performanceRating: 5, homeworkRating: null },
        { sessionId: second.id, status: 'present', performanceRating: 3, homeworkRating: 4 },
      ]);
      expect(body.students[1]?.records).toEqual([
        { sessionId: first.id, status: 'absent', performanceRating: null, homeworkRating: null },
      ]);
      expect(scheduled.status).toBe('scheduled');
    });

    it('is empty for a group with no Held session', async () => {
      const group = await newGroup();
      await grid(group.id)
        .expect(200)
        .expect(({ body }) => {
          expect(body).toEqual({ sessions: [], students: [] });
        });
    });

    it('keeps a transferred student in the group they were in that day', async () => {
      const oldGroup = await newGroup();
      const newerGroup = await newGroup();
      const student = await newStudent('Amal');
      await enroll(student, oldGroup.id, '2026-10-01', '2026-10-14');
      await enroll(student, newerGroup.id, '2026-10-15');
      const [oldSession] = await sessionsOf(oldGroup.id);
      const [newSession] = await sessionsOf(newerGroup.id);
      if (!oldSession || !newSession) throw new Error('need sessions');
      await hold(oldSession.id, '2026-10-08T14:00:00.000Z', 1);
      await hold(newSession.id, '2026-10-20T14:00:00.000Z', 1);

      const old = (await grid(oldGroup.id).expect(200)).body as GroupAttendance;
      const newer = (await grid(newerGroup.id).expect(200)).body as GroupAttendance;
      expect(old.students.map((s) => s.student.name)).toEqual(['Amal']);
      expect(newer.students.map((s) => s.student.name)).toEqual(['Amal']);
      // A student who left before the only session is not a row of the later group.
      const later = await newGroup();
      const [laterSession] = await sessionsOf(later.id);
      if (!laterSession) throw new Error('need a session');
      await hold(laterSession.id, '2026-10-20T14:00:00.000Z', 1);
      await enroll(await newStudent('Mona'), later.id, '2026-10-01', '2026-10-14');
      expect(((await grid(later.id).expect(200)).body as GroupAttendance).students).toEqual([]);
    });

    it('bounds by academy-local dates, both included, across the DST change', async () => {
      const group = await newGroup();
      const sessions = await sessionsOf(group.id);
      const [a, b, c, d] = sessions;
      if (!a || !b || !c || !d) throw new Error('need four sessions');
      // Egypt goes back to UTC+2 after Thursday 2026-10-29. All local times below are on the
      // day named: 13:00 on the 29th (UTC+3), 12:00 and 23:30 on the 30th (UTC+2), 00:30 on
      // the 31st (UTC+2). A fixed +3 offset would put the third one on the 31st.
      await hold(a.id, '2026-10-29T10:00:00.000Z', 1);
      await hold(b.id, '2026-10-30T10:00:00.000Z', 2);
      await hold(c.id, '2026-10-30T21:30:00.000Z', 3);
      await hold(d.id, '2026-10-30T22:30:00.000Z', 4);

      const ids = async (query: string) =>
        ((await grid(group.id, query).expect(200)).body as GroupAttendance).sessions.map(
          (s) => s.id,
        );
      expect(await ids('?from=2026-10-30&to=2026-10-30')).toEqual([b.id, c.id]);
      expect(await ids('?from=2026-10-29&to=2026-10-29')).toEqual([a.id]);
      expect(await ids('?from=2026-10-31&to=2026-10-31')).toEqual([d.id]);
      expect(await ids('?from=2026-10-30')).toEqual([b.id, c.id, d.id]);
      expect(await ids('?to=2026-10-29')).toEqual([a.id]);
      expect(await ids('')).toEqual([a.id, b.id, c.id, d.id]);
    });

    it.each([
      ['from after to', '?from=2026-10-31&to=2026-10-30'],
      ['a date that is not real', '?from=2026-02-30'],
      ['text', '?to=tomorrow'],
    ])('refuses %s with 400', async (_label, query) => {
      const group = await newGroup();
      await grid(group.id, query)
        .expect(400)
        .expect(({ body }) => {
          expect((body as ErrorResponse).code).toBe('VALIDATION_FAILED');
        });
    });

    it('applies the scope: the group instructor sees all, another session instructor only theirs', async () => {
      const group = await newGroup();
      const [first, second] = await sessionsOf(group.id);
      if (!first || !second) throw new Error('need two sessions');
      const student = await newStudent('Amal');
      await enroll(student, group.id, '2026-10-01');
      await hold(first.id, '2026-10-08T14:00:00.000Z', 1);
      await hold(second.id, '2026-10-15T14:00:00.000Z', 2, ben);
      await record(first.id, student, 'present');
      await record(second.id, student, 'present');

      const idsFor = async (token: string) =>
        ((await grid(group.id, '', token).expect(200)).body as GroupAttendance).sessions.map(
          (s) => s.id,
        );
      expect(await idsFor(anaToken)).toEqual([first.id, second.id]);
      expect(await idsFor(benToken)).toEqual([second.id]);
      expect(await idsFor(adminToken)).toEqual([first.id, second.id]);

      // After the group changes hands, the former instructor keeps only what they taught.
      await request(server())
        .patch(api(`/groups/${group.id}`))
        .set(as(adminToken))
        .send({ instructorId: ben })
        .expect(200);
      expect(await idsFor(anaToken)).toEqual([first.id]);
      expect(await idsFor(benToken)).toEqual([first.id, second.id]);
    });

    it('is 403 for an instructor with no session in the group, 404 for an unknown group', async () => {
      const group = await newGroup();
      await grid(group.id, '', benToken).expect(403);
      await grid('0b8c5a3e-1f2d-4c6b-9a7e-3d4f5a6b7c8d').expect(404);
    });

    it('is 404 for a group of another academy', async () => {
      const group = await newGroup(otherInstructor, otherAdminToken);
      await grid(group.id).expect(404);
    });
  });

  describe("a student's attendance", () => {
    it('lists only Held sessions, newest first, paged', async () => {
      const group = await newGroup();
      const [a, b, c, undone] = await sessionsOf(group.id);
      if (!a || !b || !c || !undone) throw new Error('need four sessions');
      const student = await newStudent('Amal');
      await enroll(student, group.id, '2026-10-01');
      await hold(a.id, '2026-10-08T14:00:00.000Z', 1);
      await hold(b.id, '2026-10-15T14:00:00.000Z', 2);
      await hold(c.id, '2026-10-20T14:00:00.000Z', 3);
      await record(a.id, student, 'present', 4, null);
      await record(b.id, student, 'absent');
      await record(c.id, student, 'present', 5, 3);
      // A row on a session that is no longer Held (for example after an undo) does not appear.
      await record(undone.id, student, 'present');

      const first = (await history(student, '?pageSize=2').expect(200))
        .body as Page<StudentAttendanceItem>;
      expect(first.meta).toEqual({ page: 1, pageSize: 2, total: 3 });
      expect(first.data.map((item) => item.sessionId)).toEqual([c.id, b.id]);
      expect(first.data[0]).toEqual({
        sessionId: c.id,
        scheduledAt: '2026-10-20T14:00:00.000Z',
        sessionNumber: 3,
        group: { id: group.id, name: group.name },
        status: 'present',
        performanceRating: 5,
        homeworkRating: 3,
      });
      const second = (await history(student, '?pageSize=2&page=2').expect(200))
        .body as Page<StudentAttendanceItem>;
      expect(second.data.map((item) => item.sessionId)).toEqual([a.id]);
    });

    it('follows the student across groups', async () => {
      const oldGroup = await newGroup();
      const newerGroup = await newGroup();
      const student = await newStudent('Amal');
      await enroll(student, oldGroup.id, '2026-10-01', '2026-10-14');
      await enroll(student, newerGroup.id, '2026-10-15');
      const [oldSession] = await sessionsOf(oldGroup.id);
      const [newSession] = await sessionsOf(newerGroup.id);
      if (!oldSession || !newSession) throw new Error('need sessions');
      await hold(oldSession.id, '2026-10-08T14:00:00.000Z', 1);
      await hold(newSession.id, '2026-10-20T14:00:00.000Z', 1);
      await record(oldSession.id, student, 'present');
      await record(newSession.id, student, 'absent');

      const body = (await history(student).expect(200)).body as Page<StudentAttendanceItem>;
      expect(body.data.map((item) => item.group.id)).toEqual([newerGroup.id, oldGroup.id]);
    });

    it('shows scope own only what it can see, and 403 without any link to the student', async () => {
      const anaGroup = await newGroup();
      const benGroup = await newGroup(ben);
      const [anaSession] = await sessionsOf(anaGroup.id);
      const [benSession] = await sessionsOf(benGroup.id);
      if (!anaSession || !benSession) throw new Error('need sessions');
      const student = await newStudent('Amal');
      await enroll(student, benGroup.id, '2026-10-01', '2026-10-14');
      await enroll(student, anaGroup.id, '2026-10-15');
      await hold(benSession.id, '2026-10-08T14:00:00.000Z', 1);
      await hold(anaSession.id, '2026-10-20T14:00:00.000Z', 1);
      await record(benSession.id, student, 'present');
      await record(anaSession.id, student, 'present');

      const idsFor = async (token: string) =>
        (
          (await history(student, '', token).expect(200)).body as Page<StudentAttendanceItem>
        ).data.map((item) => item.sessionId);
      expect(await idsFor(adminToken)).toEqual([anaSession.id, benSession.id]);
      // Ana teaches the student's current group but not the old one; Ben taught the old one.
      expect(await idsFor(anaToken)).toEqual([anaSession.id]);
      expect(await idsFor(benToken)).toEqual([benSession.id]);

      const stranger = await newStudent('Mona');
      await enroll(stranger, anaGroup.id, '2026-10-01');
      await history(stranger, '', benToken).expect(403);
    });

    it('is an empty page for a student the instructor teaches now with nothing recorded yet', async () => {
      const group = await newGroup();
      const student = await newStudent('Amal');
      await enroll(student, group.id, '2026-10-01');

      await history(student, '', anaToken)
        .expect(200)
        .expect(({ body }) => {
          expect(body).toEqual({ data: [], meta: { page: 1, pageSize: 20, total: 0 } });
        });
    });

    it('is 404 for an unknown student and for another academy', async () => {
      const outsider = await prisma.unscoped.student.create({
        data: {
          academyId: otherAcademyId,
          code: 'OT-1',
          name: 'Outsider',
          nameSearch: 'outsider',
          parentName: 'Parent',
          parentPhone: '+201000000001',
        },
      });
      await history(outsider.id).expect(404);
      await history('0b8c5a3e-1f2d-4c6b-9a7e-3d4f5a6b7c8d').expect(404);
    });

    it.each([['page=0'], ['pageSize=101'], ['page=x']])('refuses %s with 400', async (query) => {
      const student = await newStudent('Amal');
      await history(student, '?' + query).expect(400);
    });
  });
});
