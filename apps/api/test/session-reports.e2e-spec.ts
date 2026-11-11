import type { INestApplication } from '@nestjs/common';
import { SystemRole, type Group } from '@kidzzy/shared';
import request from 'supertest';
import type { App } from 'supertest/types';
import { AttendanceRepository } from '../src/modules/attendance/attendance.repository';
import { PrismaService } from '../src/modules/prisma/prisma.service';
import * as format from '../src/modules/session-reports/session-report.format';
import { SessionReportJob } from '../src/modules/session-reports/session-report.job';
import { SessionReportService } from '../src/modules/session-reports/session-report.service';
import { TenantContext } from '../src/modules/tenancy/tenant-context';
import {
  createAcademy,
  createTestApp,
  createUser,
  postHeldWith,
  readCookies,
  removeAcademy,
} from './helpers';

// The session reports to the admins (SCRUM-43): held and cancelled inside the write, "not marked
// yet" on the tick. The clock is a variable so a test can move it.
const NOW = new Date('2026-10-22T10:00:00.000Z');

describe('Session reports (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let current: Date;
  let academyId: string;
  let otherAcademyId: string;
  let adminId: string;
  let secondAdminId: string;
  let inactiveAdminId: string;
  let instructorId: string;
  let otherAdminId: string;
  let adminToken: string;
  let instructorToken: string;
  const password = 'correct-horse-1';
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  const mail = (name: string) => `${name}-${stamp}@test.local`;

  const server = () => app.getHttpServer();
  const api = (path: string) => `/api/v1${path}`;
  const as = (token: string) => ({ Cookie: `access_token=${token}` });
  const job = () => app.get(SessionReportJob);

  async function login(name: string): Promise<string> {
    const res = await request(server())
      .post(api('/auth/login'))
      .send({ login: mail(name), password })
      .expect(200);
    return readCookies(res.headers['set-cookie']).access_token.value;
  }

  beforeAll(async () => {
    current = NOW;
    app = await createTestApp({ loginRateLimit: 1000, now: () => current });
    prisma = app.get(PrismaService);
    academyId = await createAcademy(prisma, 'session-reports');
    otherAcademyId = await createAcademy(prisma, 'session-reports-other');
    adminId = await createUser(prisma, academyId, {
      name: 'admin',
      email: mail('admin'),
      password,
      role: SystemRole.Admin,
    });
    secondAdminId = await createUser(prisma, academyId, {
      name: 'second',
      email: mail('second'),
      password,
      role: SystemRole.Admin,
    });
    inactiveAdminId = await createUser(prisma, academyId, {
      name: 'inactive',
      email: mail('inactive'),
      password,
      role: SystemRole.Admin,
      isActive: false,
    });
    instructorId = await createUser(prisma, academyId, {
      name: 'ana',
      email: mail('ana'),
      password,
      role: SystemRole.Instructor,
    });
    otherAdminId = await createUser(prisma, otherAcademyId, {
      name: 'other',
      email: mail('other'),
      password,
      role: SystemRole.Admin,
    });
    adminToken = await login('admin');
    instructorToken = await login('ana');
  });

  afterAll(async () => {
    await removeAcademy(prisma, academyId);
    await removeAcademy(prisma, otherAcademyId);
    await app.close();
  });

  let groupCount = 0;
  async function newGroup(): Promise<Group> {
    groupCount += 1;
    const res = await request(server())
      .post(api('/groups'))
      .set(as(adminToken))
      .send({
        name: `Reports ${stamp} ${groupCount}`,
        level: 'Scratch 1',
        instructorId,
        startDate: '2026-10-01',
        schedule: [{ weekday: 4, startTime: '17:00', durationMin: 60 }],
      })
      .expect(201);
    return res.body as Group;
  }

  /** The group's first generated session, moved to a chosen instant. */
  async function sessionAt(groupId: string, at: string) {
    const [session] = await prisma.unscoped.session.findMany({
      where: { groupId },
      orderBy: [{ scheduledAt: 'asc' }, { id: 'asc' }],
    });
    if (!session) throw new Error('expected a generated session');
    return prisma.unscoped.session.update({
      where: { id: session.id },
      data: { scheduledAt: new Date(at) },
    });
  }

  async function student(groupId: string, name: string): Promise<string> {
    const created = await prisma.unscoped.student.create({
      data: {
        academyId,
        code: `KC-${Math.random().toString(36).slice(2, 8).toUpperCase()}`,
        name,
        nameSearch: name.toLowerCase(),
        parentName: 'Parent',
        parentPhone: '+201000000000',
      },
    });
    await prisma.unscoped.enrollment.create({
      data: { academyId, studentId: created.id, groupId, startDate: new Date('2026-10-01') },
    });
    return created.id;
  }

  const hold = (id: string, body: unknown, token = adminToken) =>
    postHeldWith(server(), prisma, id, token, () => body as object);
  const cancel = (id: string, reason: string) =>
    request(server())
      .post(api(`/sessions/${id}/cancel`))
      .set(as(adminToken))
      .send({ reason });
  const present = (studentId: string, performanceRating?: number, note?: string) => ({
    studentId,
    status: 'present',
    ...(performanceRating ? { performanceRating } : {}),
    ...(note ? { note } : {}),
  });
  const absent = (studentId: string, note?: string) => ({
    studentId,
    status: 'absent',
    ...(note ? { note } : {}),
  });

  const reportsFor = async (userId: string, group: Group) =>
    (
      await prisma.unscoped.notification.findMany({
        where: { userId, type: 'session_report' },
        orderBy: { createdAt: 'asc' },
      })
    ).filter((note) => note.title.includes(group.name));
  const claims = (sessionId: string) =>
    prisma.unscoped.sessionReport.findMany({ where: { sessionId }, orderBy: { kind: 'asc' } });

  describe('held', () => {
    it('is sent with the Held: the counts, the topic cut to 60, three absent names and the average', async () => {
      const group = await newGroup();
      const session = await sessionAt(group.id, '2026-10-21T08:00:00.000Z');
      const ids = {
        a: await student(group.id, 'Absent A'),
        b: await student(group.id, 'Absent B'),
        c: await student(group.id, 'Absent C'),
        d: await student(group.id, 'Absent D'),
        p1: await student(group.id, 'Present 1'),
        p2: await student(group.id, 'Present 2'),
      };

      await hold(session.id, {
        topic: 'x'.repeat(70),
        attendance: [
          absent(ids.a),
          absent(ids.b),
          absent(ids.c),
          absent(ids.d),
          present(ids.p1, 5),
          present(ids.p2, 4),
        ],
      }).expect(200);

      const [report] = await reportsFor(adminId, group);
      expect(report?.title).toBe(`تقرير حصة: جروب ${group.name}`);
      expect(report?.body).toBe(
        `حضر 2 من 6، المدة دقيقة، الشرح: ${'x'.repeat(60)}…، غاب: Absent A، Absent B، Absent C و1 كمان، متوسط الاداء 4.5`,
      );
      expect(report?.data).toEqual({ url: `/sessions/${session.id}`, sessionId: session.id });
      expect(await reportsFor(adminId, group)).toHaveLength(1);
    });

    it('has no average without a rating, and says so for a session with no students', async () => {
      const group = await newGroup();
      const session = await sessionAt(group.id, '2026-10-21T08:00:00.000Z');
      const one = await student(group.id, 'Solo');
      await hold(session.id, { topic: 'Loops', attendance: [present(one)] }).expect(200);
      expect((await reportsFor(adminId, group))[0]?.body).toBe(
        'حضر 1 من 1، المدة دقيقة، الشرح: Loops',
      );

      const empty = await newGroup();
      const emptySession = await sessionAt(empty.id, '2026-10-21T08:00:00.000Z');
      await hold(emptySession.id, { topic: 'Loops', attendance: [] }).expect(200);
      expect((await reportsFor(adminId, empty))[0]?.body).toBe(
        'مفيش طلاب مسجلين في الحصة، المدة دقيقة، الشرح: Loops',
      );
    });

    it('is not sent again after an attendance or a topic edit, or after an undo and a new Held', async () => {
      const group = await newGroup();
      const session = await sessionAt(group.id, '2026-10-21T08:00:00.000Z');
      const one = await student(group.id, 'Solo');
      await hold(session.id, { topic: 'Loops', attendance: [present(one)] }).expect(200);

      await request(server())
        .put(api(`/sessions/${session.id}/attendance`))
        .set(as(adminToken))
        .send({ records: [absent(one)] })
        .expect(200);
      await request(server())
        .patch(api(`/sessions/${session.id}`))
        .set(as(adminToken))
        .send({ topic: 'Functions' })
        .expect(200);
      await request(server())
        .post(api(`/sessions/${session.id}/undo-held`))
        .set(as(adminToken))
        .expect(200);
      await hold(session.id, { topic: 'Again', attendance: [present(one)] }).expect(200);

      expect(await reportsFor(adminId, group)).toHaveLength(1);
      expect((await claims(session.id)).map((row) => row.kind)).toEqual(['held']);
    });

    it('goes to each active admin once, and to no instructor, no inactive admin and no other academy', async () => {
      const group = await newGroup();
      const session = await sessionAt(group.id, '2026-10-21T08:00:00.000Z');
      await hold(session.id, { topic: 'Loops', attendance: [] }, instructorToken).expect(200);

      expect(await reportsFor(adminId, group)).toHaveLength(1);
      expect(await reportsFor(secondAdminId, group)).toHaveLength(1);
      expect(await reportsFor(instructorId, group)).toHaveLength(0);
      expect(await reportsFor(inactiveAdminId, group)).toHaveLength(0);
      expect(await reportsFor(otherAdminId, group)).toHaveLength(0);
      expect(
        await prisma.unscoped.reminderJob.count({
          where: { academyId, kind: 'notification.push' },
        }),
      ).toBeGreaterThan(0);
    });

    it('never carries a student note into a notification or a push job', async () => {
      const group = await newGroup();
      const session = await sessionAt(group.id, '2026-10-21T08:00:00.000Z');
      const one = await student(group.id, 'Solo');
      const two = await student(group.id, 'Duo');
      await hold(session.id, {
        topic: 'Loops',
        attendance: [present(one, 3, 'SECRET-NOTE-ONE'), absent(two, 'SECRET-NOTE-TWO')],
      }).expect(200);

      expect(await reportsFor(adminId, group)).toHaveLength(1);
      const everything = JSON.stringify([
        await prisma.unscoped.notification.findMany({ where: { academyId } }),
        await prisma.unscoped.reminderJob.findMany({ where: { academyId } }),
      ]);
      expect(everything).not.toContain('SECRET-NOTE');
    });

    it('does not fail the Held when the text cannot be built, and uses no report for it', async () => {
      const group = await newGroup();
      const session = await sessionAt(group.id, '2026-10-21T08:00:00.000Z');
      const spy = jest
        .spyOn(app.get(AttendanceRepository), 'findForReport')
        .mockResolvedValueOnce(null as never);
      try {
        await hold(session.id, { topic: 'Loops', attendance: [] }).expect(200);
      } finally {
        spy.mockRestore();
      }

      const row = await prisma.unscoped.session.findUniqueOrThrow({ where: { id: session.id } });
      expect(row.status).toBe('held');
      expect(await reportsFor(adminId, group)).toHaveLength(0);
      expect(await claims(session.id)).toHaveLength(0);
    });
  });

  describe('cancelled', () => {
    it('carries the reason cut to 80, for a session days ahead', async () => {
      const group = await newGroup();
      const session = await sessionAt(group.id, '2026-10-28T14:00:00.000Z');

      await cancel(session.id, `${'r'.repeat(90)}`).expect(200);

      const [report] = await reportsFor(adminId, group);
      expect(report?.title).toBe(`اتلغت حصة: جروب ${group.name}`);
      // Wednesday 2026-10-28, 14:00Z is 17:00 in Cairo (still on summer time).
      expect(report?.body).toBe(`الأربعاء الساعة 5:00 م، السبب: ${'r'.repeat(80)}…`);
      expect(await reportsFor(secondAdminId, group)).toHaveLength(1);
      expect(await reportsFor(instructorId, group)).toHaveLength(0);
    });

    it('shows the same wall-clock time on both sides of the Cairo clock change', async () => {
      const before = await newGroup();
      const after = await newGroup();
      const summer = await sessionAt(before.id, '2026-10-29T14:00:00.000Z');
      const winter = await sessionAt(after.id, '2026-10-30T15:00:00.000Z');

      await cancel(summer.id, 'a').expect(200);
      await cancel(winter.id, 'b').expect(200);

      expect((await reportsFor(adminId, before))[0]?.body).toBe('الخميس الساعة 5:00 م، السبب: a');
      expect((await reportsFor(adminId, after))[0]?.body).toBe('الجمعة الساعة 5:00 م، السبب: b');
    });

    it('does not fail the Cancel when the text cannot be built', async () => {
      const group = await newGroup();
      const session = await sessionAt(group.id, '2026-10-28T14:00:00.000Z');
      const spy = jest.spyOn(format, 'cancelledReport').mockImplementationOnce(() => {
        throw new Error('boom');
      });
      try {
        await cancel(session.id, 'weather').expect(200);
      } finally {
        spy.mockRestore();
      }

      const row = await prisma.unscoped.session.findUniqueOrThrow({ where: { id: session.id } });
      expect(row.status).toBe('cancelled');
      expect(await reportsFor(adminId, group)).toHaveLength(0);
    });
  });

  describe('not marked yet', () => {
    afterEach(() => {
      current = NOW;
    });

    it('is sent by the tick two hours after the session ended, and only once', async () => {
      const group = await newGroup();
      // 05:00Z to 06:00Z; two hours after the end is 08:00Z.
      const session = await sessionAt(group.id, '2026-10-22T05:00:00.000Z');

      current = new Date('2026-10-22T07:59:00.000Z');
      await job().reportAll();
      expect(await reportsFor(adminId, group)).toHaveLength(0);

      current = new Date('2026-10-22T08:00:00.000Z');
      await job().reportAll();
      await job().reportAll();

      const [report] = await reportsFor(adminId, group);
      expect(report?.title).toBe(`حصة لسه متسجلتش: جروب ${group.name}`);
      expect(report?.body).toBe('الخميس الساعة 8:00 ص، المدرس ana');
      expect(report?.data).toEqual({ url: `/sessions/${session.id}`, sessionId: session.id });
      expect(await reportsFor(adminId, group)).toHaveLength(1);
      expect(await reportsFor(secondAdminId, group)).toHaveLength(1);
      expect(await reportsFor(instructorId, group)).toHaveLength(0);
    });

    it('ignores a session that ended more than 24 hours ago', async () => {
      const group = await newGroup();
      await sessionAt(group.id, '2026-10-20T05:00:00.000Z');

      current = new Date('2026-10-22T08:00:00.000Z');
      await job().reportAll();

      expect(await reportsFor(adminId, group)).toHaveLength(0);
    });

    it('sends the held report too when the session is marked Held afterwards', async () => {
      const group = await newGroup();
      const session = await sessionAt(group.id, '2026-10-22T05:00:00.000Z');

      current = new Date('2026-10-22T08:00:00.000Z');
      await job().reportAll();
      await hold(session.id, { topic: 'Late', attendance: [] }).expect(200);

      const titles = (await reportsFor(adminId, group)).map((note) => note.title);
      expect(titles).toEqual([
        `حصة لسه متسجلتش: جروب ${group.name}`,
        `تقرير حصة: جروب ${group.name}`,
      ]);
      expect((await claims(session.id)).map((row) => row.kind)).toEqual(['held', 'unmarked']);
    });

    it('does not report a session that was marked or cancelled in time', async () => {
      const held = await newGroup();
      const cancelled = await newGroup();
      const heldSession = await sessionAt(held.id, '2026-10-22T05:00:00.000Z');
      const cancelledSession = await sessionAt(cancelled.id, '2026-10-22T05:00:00.000Z');
      await hold(heldSession.id, { topic: 'On time', attendance: [] }).expect(200);
      await cancel(cancelledSession.id, 'sick').expect(200);

      current = new Date('2026-10-22T08:00:00.000Z');
      await job().reportAll();

      expect((await claims(heldSession.id)).map((row) => row.kind)).toEqual(['held']);
      expect((await claims(cancelledSession.id)).map((row) => row.kind)).toEqual(['cancelled']);
    });

    it('lets one academy fail without stopping another', async () => {
      const group = await newGroup();
      await sessionAt(group.id, '2026-10-22T05:00:00.000Z');
      const otherGroup = await prisma.unscoped.group.create({
        data: {
          academyId: otherAcademyId,
          name: `Other ${stamp}`,
          searchText: 'other',
          level: 'Scratch 1',
          instructorId: otherAdminId,
          startDate: new Date('2026-10-01'),
        },
      });
      const otherSession = await prisma.unscoped.session.create({
        data: {
          academyId: otherAcademyId,
          groupId: otherGroup.id,
          instructorId: otherAdminId,
          scheduledAt: new Date('2026-10-22T05:00:00.000Z'),
          durationMin: 60,
        },
      });

      const service = app.get(SessionReportService);
      const tenant = app.get(TenantContext);
      const original = service.listUnmarked.bind(service);
      const spy = jest.spyOn(service, 'listUnmarked').mockImplementation(() => {
        if (tenant.requireAcademyId() === academyId) return Promise.reject(new Error('boom'));
        return original();
      });
      current = new Date('2026-10-22T08:00:00.000Z');
      try {
        await job().reportAll();
      } finally {
        spy.mockRestore();
      }

      expect(await reportsFor(adminId, group)).toHaveLength(0);
      expect(await claims(otherSession.id)).toHaveLength(1);
      expect(
        await prisma.unscoped.notification.count({
          where: { userId: otherAdminId, type: 'session_report' },
        }),
      ).toBe(1);
    });
  });

  it('registers the report service in the Held hooks of the real app', () => {
    expect(app.get(SessionReportService)).toBeDefined();
  });
});
