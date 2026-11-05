import type { INestApplication } from '@nestjs/common';
import {
  SystemRole,
  type Group,
  type HeldResult,
  type Session,
  type SessionAttendance,
} from '@kidzzy/shared';
import request from 'supertest';
import type { App } from 'supertest/types';
import { SessionHeldHooks } from '../src/modules/sessions/session-held-hooks';
import { PrismaService } from '../src/modules/prisma/prisma.service';
import { createAcademy, createTestApp, createUser, readCookies, removeAcademy } from './helpers';

// Marking a session Held with its topic and attendance in one request (SCRUM-79).
const NOW = new Date('2026-10-22T10:00:00.000Z');
type ErrorResponse = { code: string; errors?: { field: string; message: string }[] };

describe('Held with topic and attendance (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let academyId: string;
  let otherAcademyId: string;
  let ana: string;
  let adminToken: string;
  let anaToken: string;
  let benToken: string;
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
        name: `Held ${Math.random().toString(36).slice(2, 8)}`,
        level: 'Scratch 1',
        instructorId: ana,
        startDate: '2026-10-01',
        schedule: [{ weekday: 4, startTime: '17:00', durationMin: 60 }],
      })
      .expect(201);
    return res.body as Group;
  }

  /** The group's first generated session, moved into the past so it can be marked. */
  async function pastSession(groupId: string, at = '2026-10-21T08:00:00.000Z') {
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

  /** Enrolls through the API, with a plan, so a payment cycle exists for the student. */
  async function enrollWithPlan(groupId: string, studentId: string, sessionsPerCycle: number) {
    await request(server())
      .post(api(`/groups/${groupId}/enrollments`))
      .set(as(adminToken))
      .send({
        studentId,
        startDate: '2026-10-01',
        plan: { sessionsPerCycle, amount: '1000.00' },
        openingCount: 0,
      })
      .expect(201);
  }
  const cycleOf = (studentId: string) =>
    prisma.unscoped.paymentCycle.findFirstOrThrow({ where: { studentId } });

  const hold = (id: string, body: unknown, token = adminToken) =>
    request(server())
      .post(api(`/sessions/${id}/held`))
      .set(as(token))
      .send(body as object);
  const present = (studentId: string, extra: object = {}) => ({
    studentId,
    status: 'present',
    ...extra,
  });
  const absent = (studentId: string, extra: object = {}) => ({
    studentId,
    status: 'absent',
    ...extra,
  });
  const attendanceOf = (id: string, token = adminToken) =>
    request(server())
      .get(api(`/sessions/${id}/attendance`))
      .set(as(token));
  const save = (id: string, records: unknown, token = adminToken) =>
    request(server())
      .put(api(`/sessions/${id}/attendance`))
      .set(as(token))
      .send({ records });
  const patchTopic = (id: string, body: unknown, token = adminToken) =>
    request(server())
      .patch(api(`/sessions/${id}`))
      .set(as(token))
      .send(body as object);
  const row = (id: string) => prisma.unscoped.session.findUniqueOrThrow({ where: { id } });
  const stored = (id: string) => prisma.unscoped.attendance.findMany({ where: { sessionId: id } });
  const audit = (id: string, action: string) =>
    prisma.unscoped.auditLog.findMany({ where: { entityId: id, action } });

  beforeAll(async () => {
    app = await createTestApp({ loginRateLimit: 1000, now: NOW });
    prisma = app.get(PrismaService);
    academyId = await createAcademy(prisma, 'held-attendance');
    otherAcademyId = await createAcademy(prisma, 'held-attendance-other');

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
    await createUser(prisma, academyId, {
      name: 'ben',
      email: mail('ben'),
      password,
      role: SystemRole.Instructor,
    });
    adminToken = await login(mail('admin'));
    anaToken = await login(mail('ana'));
    benToken = await login(mail('ben'));
  });

  afterAll(async () => {
    await removeAcademy(prisma, academyId);
    await removeAcademy(prisma, otherAcademyId);
    await app.close();
  });

  it('has an attendance recorder registered in the real app', () => {
    expect(app.get(SessionHeldHooks).hasRecorder()).toBe(true);
  });

  it('saves the topic and a complete attendance, and still counts the cycles', async () => {
    const group = await newGroup();
    const session = await pastSession(group.id);
    const amal = await newStudent('Amal');
    const mona = await newStudent('Mona');
    await enrollWithPlan(group.id, amal, 8);
    await enroll(mona, group.id, '2026-10-01');

    const res = await hold(session.id, {
      topic: '  Loops  ',
      attendance: [
        present(amal, { performanceRating: 5, homeworkRating: 4, note: ' Great ' }),
        absent(mona, { note: 'Sick' }),
      ],
    }).expect(200);

    const body = res.body as HeldResult;
    expect(body.status).toBe('held');
    expect(body.sessionNumber).toBe(1);
    expect(body.topic).toBe('Loops');
    expect(JSON.stringify(body)).not.toContain('Great');
    expect(JSON.stringify(body)).not.toContain('Sick');

    const read = (await attendanceOf(session.id).expect(200)).body as SessionAttendance;
    expect(read.records).toEqual([
      {
        studentId: amal,
        studentName: 'Amal',
        status: 'present',
        performanceRating: 5,
        homeworkRating: 4,
        note: 'Great',
      },
      {
        studentId: mona,
        studentName: 'Mona',
        status: 'absent',
        performanceRating: null,
        homeworkRating: null,
        note: 'Sick',
      },
    ]);
    // The session was counted in the same transaction, whatever the attendance says.
    expect((await cycleOf(amal)).sessionsCounted).toBe(1);
  });

  it('stores a topic and a note that end with a newline trimmed', async () => {
    const group = await newGroup();
    const session = await pastSession(group.id);
    const amal = await newStudent('Amal');
    await enroll(amal, group.id, '2026-10-01');

    await hold(session.id, {
      topic: 'Loops\n',
      attendance: [present(amal, { note: 'Good\t\n' })],
    }).expect(200);

    expect((await row(session.id)).topic).toBe('Loops');
    expect((await stored(session.id))[0]?.note).toBe('Good');
  });

  it('refuses a missing, blank or too long topic with 400 and a bad note length with 400', async () => {
    const group = await newGroup();
    const session = await pastSession(group.id);
    for (const body of [
      { attendance: [] },
      { topic: '   ', attendance: [] },
      { topic: 'x'.repeat(301), attendance: [] },
      { topic: 'Loops' },
    ]) {
      await hold(session.id, body).expect(400);
    }
    const amal = await newStudent('Amal');
    await enroll(amal, group.id, '2026-10-01');
    await hold(session.id, {
      topic: 'Loops',
      attendance: [present(amal, { note: 'x'.repeat(501) })],
    }).expect(400);
    expect((await row(session.id)).status).toBe('scheduled');
  });

  it('takes an empty list for a session with no students', async () => {
    const group = await newGroup();
    const session = await pastSession(group.id);
    await hold(session.id, { topic: 'Loops', attendance: [] }).expect(200);
    expect((await row(session.id)).topic).toBe('Loops');
  });

  it('refuses a missing student with 422 ATTENDANCE_INCOMPLETE and changes nothing', async () => {
    const group = await newGroup();
    const session = await pastSession(group.id);
    const amal = await newStudent('Amal');
    const mona = await newStudent('Mona');
    await enrollWithPlan(group.id, amal, 8);
    await enroll(mona, group.id, '2026-10-01');

    const res = await hold(session.id, { topic: 'Loops', attendance: [present(amal)] }).expect(422);
    const error = res.body as ErrorResponse;
    expect(error.code).toBe('ATTENDANCE_INCOMPLETE');
    expect(error.errors).toEqual([{ field: 'attendance', message: mona }]);

    const after = await row(session.id);
    expect(after.status).toBe('scheduled');
    expect(after.sessionNumber).toBeNull();
    expect(after.topic).toBeNull();
    expect(await stored(session.id)).toHaveLength(0);
    expect(await audit(session.id, 'session.held')).toHaveLength(0);
    // Nothing was counted: the cycle is where it was.
    expect((await cycleOf(amal)).sessionsCounted).toBe(0);
  });

  it('refuses a foreign student with 422 STUDENT_NOT_IN_SESSION first, even with a student missing', async () => {
    const group = await newGroup();
    const session = await pastSession(group.id);
    const amal = await newStudent('Amal');
    const mona = await newStudent('Mona');
    const outsider = await newStudent('Outsider');
    await enroll(amal, group.id, '2026-10-01');
    await enroll(mona, group.id, '2026-10-01');

    // Mona is missing, the outsider is extra, and Amal is absent with a rating: the foreign
    // student is the one reported.
    const res = await hold(session.id, {
      topic: 'Loops',
      attendance: [absent(amal, { performanceRating: 3 }), present(outsider)],
    }).expect(422);
    expect((res.body as ErrorResponse).code).toBe('STUDENT_NOT_IN_SESSION');
    expect((await row(session.id)).status).toBe('scheduled');
  });

  it('refuses a rating on an absent student with 422 STUDENT_ABSENT before reporting a missing student', async () => {
    const group = await newGroup();
    const session = await pastSession(group.id);
    const amal = await newStudent('Amal');
    const mona = await newStudent('Mona');
    await enroll(amal, group.id, '2026-10-01');
    await enroll(mona, group.id, '2026-10-01');

    const res = await hold(session.id, {
      topic: 'Loops',
      attendance: [absent(amal, { homeworkRating: 2 })],
    }).expect(422);
    expect((res.body as ErrorResponse).code).toBe('STUDENT_ABSENT');
    expect((await row(session.id)).status).toBe('scheduled');
  });

  it('refuses the same student twice with 400 even when another student is missing', async () => {
    const group = await newGroup();
    const session = await pastSession(group.id);
    const amal = await newStudent('Amal');
    const mona = await newStudent('Mona');
    await enroll(amal, group.id, '2026-10-01');
    await enroll(mona, group.id, '2026-10-01');

    const res = await hold(session.id, {
      topic: 'Loops',
      attendance: [present(amal), present(amal)],
    }).expect(400);
    expect((res.body as ErrorResponse).code).toBe('VALIDATION_FAILED');
  });

  it('answers 409 for a session that is already Held before it looks at the students', async () => {
    const group = await newGroup();
    const session = await pastSession(group.id);
    const outsider = await newStudent('Outsider');
    await hold(session.id, { topic: 'Loops', attendance: [] }).expect(200);

    const res = await hold(session.id, {
      topic: 'Again',
      attendance: [present(outsider)],
    }).expect(409);
    expect((res.body as ErrorResponse).code).toBe('SESSION_NOT_SCHEDULED');
    expect((await row(session.id)).topic).toBe('Loops');
  });

  it('requires the same students as GET attendance: the ones enrolled on the session date', async () => {
    const group = await newGroup();
    const session = await pastSession(group.id, '2026-10-21T08:00:00.000Z');
    const inside = await newStudent('Inside');
    const left = await newStudent('Left');
    const later = await newStudent('Later');
    await enroll(inside, group.id, '2026-10-01');
    await enroll(left, group.id, '2026-10-01', '2026-10-20');
    await enroll(later, group.id, '2026-10-22');

    const listed = (await attendanceOf(session.id).expect(200)).body as SessionAttendance;
    expect(listed.records.map((r) => r.studentId)).toEqual([inside]);

    await hold(session.id, { topic: 'Loops', attendance: [present(inside)] }).expect(200);
  });

  it('lets the instructor on the session and the admin mark Held, and refuses another instructor', async () => {
    const group = await newGroup();
    const first = await pastSession(group.id);
    await hold(first.id, { topic: 'By Ana', attendance: [] }, anaToken).expect(200);

    const other = await newGroup();
    const second = await pastSession(other.id);
    await hold(second.id, { topic: 'By Ben', attendance: [] }, benToken).expect(403);
    await hold(second.id, { topic: 'By admin', attendance: [] }).expect(200);
    expect((await row(second.id)).topic).toBe('By admin');
  });

  it('keeps a sent note and clears one left out on PUT', async () => {
    const group = await newGroup();
    const session = await pastSession(group.id);
    const amal = await newStudent('Amal');
    const mona = await newStudent('Mona');
    await enroll(amal, group.id, '2026-10-01');
    await enroll(mona, group.id, '2026-10-01');
    await hold(session.id, {
      topic: 'Loops',
      attendance: [present(amal, { note: 'one' }), present(mona, { note: 'two' })],
    }).expect(200);

    await save(session.id, [present(amal, { note: 'changed' }), present(mona)]).expect(200);
    const byStudent = new Map((await stored(session.id)).map((r) => [r.studentId, r.note]));
    expect(byStudent.get(amal)).toBe('changed');
    expect(byStudent.get(mona)).toBeNull();
  });

  it('corrects the topic with PATCH by the instructor on the session and by the admin, and audits it', async () => {
    const group = await newGroup();
    const session = await pastSession(group.id);
    await hold(session.id, { topic: 'Loops', attendance: [] }).expect(200);

    const res = await patchTopic(session.id, { topic: '  Functions ' }, anaToken).expect(200);
    expect((res.body as Session).topic).toBe('Functions');
    await patchTopic(session.id, { topic: 'Events' }).expect(200);

    const entries = await audit(session.id, 'session.topic_changed');
    expect(entries.map((e) => [e.before, e.after])).toEqual(
      expect.arrayContaining([
        [{ topic: 'Loops' }, { topic: 'Functions' }],
        [{ topic: 'Functions' }, { topic: 'Events' }],
      ]),
    );
  });

  it('refuses PATCH from another instructor (403), on a Scheduled session (409) and with a blank topic (400)', async () => {
    const group = await newGroup();
    const session = await pastSession(group.id);
    await patchTopic(session.id, { topic: 'Early' }).expect(409);
    await hold(session.id, { topic: 'Loops', attendance: [] }).expect(200);
    await patchTopic(session.id, { topic: 'Hacked' }, benToken).expect(403);
    await patchTopic(session.id, { topic: '   ' }).expect(400);
    await patchTopic(session.id, {}).expect(400);
    expect((await row(session.id)).topic).toBe('Loops');
  });

  it('gives a session held before the topic existed its first topic through PATCH', async () => {
    const group = await newGroup();
    const session = await pastSession(group.id);
    await hold(session.id, { topic: 'Loops', attendance: [] }).expect(200);
    await prisma.unscoped.session.update({ where: { id: session.id }, data: { topic: null } });

    const res = await patchTopic(session.id, { topic: 'Late topic' }).expect(200);
    expect((res.body as Session).topic).toBe('Late topic');
  });

  it('on undo deletes the attendance, clears the topic, and keeps the old topic (not the notes) in the audit', async () => {
    const group = await newGroup();
    const session = await pastSession(group.id);
    const amal = await newStudent('Amal');
    await enroll(amal, group.id, '2026-10-01');
    await hold(session.id, {
      topic: 'Loops',
      attendance: [present(amal, { note: 'private note about a child' })],
    }).expect(200);

    await request(server())
      .post(api(`/sessions/${session.id}/undo-held`))
      .set(as(adminToken))
      .expect(200);

    expect((await row(session.id)).topic).toBeNull();
    expect(await stored(session.id)).toHaveLength(0);
    const entries = await audit(session.id, 'session.held_undone');
    expect(entries).toHaveLength(1);
    expect(JSON.stringify(entries[0])).toContain('Loops');
    expect(JSON.stringify(entries[0])).not.toContain('private note');
  });

  it('never puts a note into an audit entry', async () => {
    const group = await newGroup();
    const session = await pastSession(group.id);
    const amal = await newStudent('Amal');
    await enroll(amal, group.id, '2026-10-01');
    await hold(session.id, {
      topic: 'Loops',
      attendance: [present(amal, { note: 'secret child note' })],
    }).expect(200);
    await save(session.id, [present(amal, { note: 'another secret child note' })]).expect(200);

    const entries = await prisma.unscoped.auditLog.findMany({ where: { entityId: session.id } });
    expect(entries.length).toBeGreaterThan(0);
    expect(JSON.stringify(entries)).not.toContain('secret child note');
  });
});
