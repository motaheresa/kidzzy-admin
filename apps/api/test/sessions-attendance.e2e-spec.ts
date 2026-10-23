import type { INestApplication } from '@nestjs/common';
import { SystemRole, type Group, type SessionAttendance } from '@kidzzy/shared';
import request from 'supertest';
import type { App } from 'supertest/types';
import { PrismaService } from '../src/modules/prisma/prisma.service';
import { createAcademy, createTestApp, createUser, readCookies, removeAcademy } from './helpers';

const NOW = new Date('2026-10-22T10:00:00.000Z');
type ErrorResponse = { code: string; errors?: { field: string }[] };

describe('Session attendance (e2e)', () => {
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
        name: `Attendance ${Math.random().toString(36).slice(2, 8)}`,
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

  async function setTime(id: string, scheduledAt: string) {
    return prisma.unscoped.session.update({
      where: { id },
      data: { scheduledAt: new Date(scheduledAt) },
    });
  }

  /** A group with one session already Held (the admin marks it, so the order rule never gets in the way). */
  async function heldSession(groupId: string, at = '2026-10-21T08:00:00.000Z') {
    const [session] = await sessionsOf(groupId);
    if (!session) throw new Error('expected a generated session');
    await setTime(session.id, at);
    await request(server())
      .post(api(`/sessions/${session.id}/held`))
      .set(as(adminToken))
      .expect(200);
    return session;
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

  const save = (id: string, records: unknown, token = anaToken) =>
    request(server())
      .put(api(`/sessions/${id}/attendance`))
      .set(as(token))
      .send({ records });
  const read = (id: string, token = anaToken) =>
    request(server())
      .get(api(`/sessions/${id}/attendance`))
      .set(as(token));

  beforeAll(async () => {
    app = await createTestApp({ loginRateLimit: 1000, now: NOW });
    prisma = app.get(PrismaService);
    academyId = await createAcademy(prisma, 'sessions-attendance');
    otherAcademyId = await createAcademy(prisma, 'sessions-attendance-other');

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

  it('saves present and absent, and lists every student of the session by name', async () => {
    const group = await newGroup();
    const session = await heldSession(group.id);
    const zed = await newStudent('Zed');
    const amal = await newStudent('Amal');
    const mona = await newStudent('Mona');
    for (const id of [zed, amal, mona]) await enroll(id, group.id, '2026-10-01');

    await read(session.id)
      .expect(200)
      .expect(({ body }) => {
        const result = body as SessionAttendance;
        expect(result.records.map((r) => r.studentName)).toEqual(['Amal', 'Mona', 'Zed']);
        expect(result.records.every((r) => r.status === null)).toBe(true);
      });

    const res = await save(session.id, [
      { studentId: amal, status: 'present', performanceRating: 5, homeworkRating: 4 },
      { studentId: zed, status: 'absent' },
    ]).expect(200);
    const result = res.body as SessionAttendance;
    expect(result.sessionId).toBe(session.id);
    expect(result.records).toEqual([
      {
        studentId: amal,
        studentName: 'Amal',
        status: 'present',
        performanceRating: 5,
        homeworkRating: 4,
      },
      {
        studentId: mona,
        studentName: 'Mona',
        status: null,
        performanceRating: null,
        homeworkRating: null,
      },
      {
        studentId: zed,
        studentName: 'Zed',
        status: 'absent',
        performanceRating: null,
        homeworkRating: null,
      },
    ]);
    const stored = await prisma.unscoped.attendance.findFirstOrThrow({
      where: { sessionId: session.id, studentId: amal },
    });
    expect(stored).toMatchObject({ recordedById: ana, academyId, status: 'present' });
    expect(stored.recordedAt).toEqual(NOW);
  });

  it('keeps the students it did not receive, and updates the one it did', async () => {
    const group = await newGroup();
    const session = await heldSession(group.id);
    const first = await newStudent('Amal');
    const second = await newStudent('Mona');
    await enroll(first, group.id, '2026-10-01');
    await enroll(second, group.id, '2026-10-01');

    await save(session.id, [{ studentId: first, status: 'present', performanceRating: 3 }]).expect(
      200,
    );
    await save(session.id, [{ studentId: second, status: 'absent' }]).expect(200);
    const res = await save(session.id, [
      { studentId: first, status: 'present', performanceRating: 5, homeworkRating: null },
    ]).expect(200);

    expect((res.body as SessionAttendance).records).toMatchObject([
      { studentId: first, status: 'present', performanceRating: 5, homeworkRating: null },
      { studentId: second, status: 'absent' },
    ]);
    expect(await prisma.unscoped.attendance.count({ where: { sessionId: session.id } })).toBe(2);
  });

  it('turns a present rating into null when the student becomes absent', async () => {
    const group = await newGroup();
    const session = await heldSession(group.id);
    const student = await newStudent('Amal');
    await enroll(student, group.id, '2026-10-01');

    await save(session.id, [
      { studentId: student, status: 'present', performanceRating: 4, homeworkRating: 2 },
    ]).expect(200);
    const res = await save(session.id, [{ studentId: student, status: 'absent' }]).expect(200);

    expect((res.body as SessionAttendance).records[0]).toMatchObject({
      status: 'absent',
      performanceRating: null,
      homeworkRating: null,
    });
  });

  it('refuses a session that is not Held', async () => {
    const group = await newGroup();
    const [session] = await sessionsOf(group.id);
    if (!session) throw new Error('expected a generated session');
    const student = await newStudent('Amal');
    await enroll(student, group.id, '2026-10-01');

    await save(session.id, [{ studentId: student, status: 'present' }])
      .expect(409)
      .expect(({ body }) => {
        expect((body as ErrorResponse).code).toBe('SESSION_NOT_HELD');
      });
    expect(await prisma.unscoped.attendance.count({ where: { sessionId: session.id } })).toBe(0);
  });

  it('refuses a student from another group or enrolled after the session date', async () => {
    const group = await newGroup();
    const otherGroup = await newGroup();
    const session = await heldSession(group.id, '2026-10-21T08:00:00.000Z');
    const inside = await newStudent('Amal');
    const elsewhere = await newStudent('Mona');
    const late = await newStudent('Zed');
    await enroll(inside, group.id, '2026-10-01');
    await enroll(elsewhere, otherGroup.id, '2026-10-01');
    await enroll(late, group.id, '2026-10-22');

    for (const studentId of [elsewhere, late]) {
      await save(session.id, [
        { studentId: inside, status: 'present' },
        { studentId, status: 'present' },
      ])
        .expect(422)
        .expect(({ body }) => {
          const error = body as ErrorResponse;
          expect(error.code).toBe('STUDENT_NOT_IN_SESSION');
          expect(error.errors?.map((e) => e.field)).toEqual(['records.1.studentId']);
        });
    }
    expect(await prisma.unscoped.attendance.count({ where: { sessionId: session.id } })).toBe(0);
  });

  it('puts a transferred student in the group they were in that day', async () => {
    const oldGroup = await newGroup();
    const newerGroup = await newGroup();
    const student = await newStudent('Amal');
    await enroll(student, oldGroup.id, '2026-10-01', '2026-10-14');
    await enroll(student, newerGroup.id, '2026-10-15');
    const [oldSession, laterOld] = await sessionsOf(oldGroup.id);
    const [newSession, earlierNew] = await sessionsOf(newerGroup.id);
    if (!oldSession || !laterOld || !newSession || !earlierNew) {
      throw new Error('expected generated sessions');
    }
    await setTime(oldSession.id, '2026-10-10T08:00:00.000Z');
    await setTime(newSession.id, '2026-10-20T08:00:00.000Z');

    const namesOn = async (sessionId: string) =>
      ((await read(sessionId).expect(200)).body as SessionAttendance).records.map(
        (r) => r.studentName,
      );
    expect(await namesOn(oldSession.id)).toEqual(['Amal']);
    expect(await namesOn(newSession.id)).toEqual(['Amal']);

    // The other way round: the old group on a new day, the new group on an old day.
    await setTime(laterOld.id, '2026-10-20T08:00:00.000Z');
    await setTime(earlierNew.id, '2026-10-10T08:00:00.000Z');
    expect(await namesOn(laterOld.id)).toEqual([]);
    expect(await namesOn(earlierNew.id)).toEqual([]);
  });

  it('refuses a rating on an absent student', async () => {
    const group = await newGroup();
    const session = await heldSession(group.id);
    const student = await newStudent('Amal');
    await enroll(student, group.id, '2026-10-01');

    await save(session.id, [{ studentId: student, status: 'absent', performanceRating: 3 }])
      .expect(422)
      .expect(({ body }) => {
        const error = body as ErrorResponse;
        expect(error.code).toBe('STUDENT_ABSENT');
        expect(error.errors?.map((e) => e.field)).toEqual(['records.0.performanceRating']);
      });
    await save(session.id, [{ studentId: student, status: 'absent', homeworkRating: 3 }]).expect(
      422,
    );
  });

  it.each([
    ['performance 0', { performanceRating: 0 }],
    ['performance 6', { performanceRating: 6 }],
    ['homework 0', { homeworkRating: 0 }],
    ['homework 6', { homeworkRating: 6 }],
    ['a half star', { performanceRating: 2.5 }],
    ['a text rating', { performanceRating: 'five' }],
  ])('refuses %s', async (_label, rating) => {
    const group = await newGroup();
    const session = await heldSession(group.id);
    const student = await newStudent('Amal');
    await enroll(student, group.id, '2026-10-01');

    await save(session.id, [{ studentId: student, status: 'present', ...rating }])
      .expect(400)
      .expect(({ body }) => {
        expect((body as ErrorResponse).code).toBe('VALIDATION_FAILED');
      });
  });

  it('accepts a null homework rating, meaning no homework', async () => {
    const group = await newGroup();
    const session = await heldSession(group.id);
    const student = await newStudent('Amal');
    await enroll(student, group.id, '2026-10-01');

    const res = await save(session.id, [
      { studentId: student, status: 'present', performanceRating: 4, homeworkRating: null },
    ]).expect(200);
    expect((res.body as SessionAttendance).records[0]).toMatchObject({
      performanceRating: 4,
      homeworkRating: null,
    });
  });

  it('refuses the same student twice, an empty list and an unknown field', async () => {
    const group = await newGroup();
    const session = await heldSession(group.id);
    const student = await newStudent('Amal');
    await enroll(student, group.id, '2026-10-01');

    await save(session.id, [
      { studentId: student, status: 'present' },
      { studentId: student, status: 'absent' },
    ])
      .expect(400)
      .expect(({ body }) => {
        const error = body as ErrorResponse;
        expect(error.code).toBe('VALIDATION_FAILED');
        expect(error.errors?.map((e) => e.field)).toEqual(['records.1.studentId']);
      });
    await save(session.id, []).expect(400);
    await save(session.id, [{ studentId: student, status: 'present', mood: 'happy' }]).expect(400);
    expect(await prisma.unscoped.attendance.count({ where: { sessionId: session.id } })).toBe(0);
  });

  it('lets the session instructor and an admin record, and forbids another instructor', async () => {
    const group = await newGroup();
    const session = await heldSession(group.id);
    const student = await newStudent('Amal');
    await enroll(student, group.id, '2026-10-01');
    const records = [{ studentId: student, status: 'present' }];

    await save(session.id, records, benToken).expect(403);
    await read(session.id, benToken).expect(403);
    expect(await prisma.unscoped.attendance.count({ where: { sessionId: session.id } })).toBe(0);
    await save(session.id, records, anaToken).expect(200);
    await save(session.id, records, adminToken).expect(200);
  });

  it('reads with the session visibility rule and writes only for the instructor on the session', async () => {
    const group = await newGroup();
    const [past, future] = await sessionsOf(group.id);
    if (!past || !future) throw new Error('expected generated sessions');
    await setTime(past.id, '2026-10-20T08:00:00.000Z');
    await request(server())
      .post(api(`/sessions/${past.id}/held`))
      .set(as(adminToken))
      .expect(200);
    const student = await newStudent('Amal');
    await enroll(student, group.id, '2026-10-01');
    await request(server())
      .patch(api(`/groups/${group.id}`))
      .set(as(adminToken))
      .send({ instructorId: ben })
      .expect(200);

    // Ben teaches the group now, Ana is still the instructor on the session she taught.
    await read(past.id, anaToken).expect(200);
    await read(past.id, benToken).expect(200);
    await read(future.id, anaToken).expect(403);
    await save(past.id, [{ studentId: student, status: 'present' }], benToken).expect(403);
    await save(past.id, [{ studentId: student, status: 'present' }], anaToken).expect(200);
  });

  it('returns 404 for a session of another academy and for an unknown one', async () => {
    const group = await newGroup(otherInstructor, otherAdminToken);
    const [session] = await sessionsOf(group.id);
    if (!session) throw new Error('expected a generated session');

    await read(session.id).expect(404);
    await save(session.id, [{ studentId: session.id, status: 'present' }]).expect(404);
    await read('0b8c5a3e-1f2d-4c6b-9a7e-3d4f5a6b7c8d').expect(404);
  });

  it('is refused by the database for an absent row with a rating, or a rating out of range', async () => {
    const group = await newGroup();
    const session = await heldSession(group.id);
    const student = await newStudent('Amal');
    await enroll(student, group.id, '2026-10-01');
    const row = {
      academyId,
      sessionId: session.id,
      studentId: student,
      recordedById: ana,
      recordedAt: NOW,
    };

    await expect(
      prisma.unscoped.attendance.create({
        data: { ...row, status: 'absent', performanceRating: 3 },
      }),
    ).rejects.toThrow();
    await expect(
      prisma.unscoped.attendance.create({
        data: { ...row, status: 'absent', homeworkRating: 1 },
      }),
    ).rejects.toThrow();
    await expect(
      prisma.unscoped.attendance.create({
        data: { ...row, status: 'present', performanceRating: 6 },
      }),
    ).rejects.toThrow();
    await expect(
      prisma.unscoped.attendance.create({
        data: { ...row, status: 'present', homeworkRating: 0 },
      }),
    ).rejects.toThrow();
    expect(await prisma.unscoped.attendance.count({ where: { sessionId: session.id } })).toBe(0);
  });
});
