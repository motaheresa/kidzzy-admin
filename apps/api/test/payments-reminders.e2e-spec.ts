import type { INestApplication } from '@nestjs/common';
import { SystemRole, NotificationType, type Group, type Student } from '@kidzzy/shared';
import request from 'supertest';
import type { App } from 'supertest/types';
import { PrismaService } from '../src/modules/prisma/prisma.service';
import { StudentRepository } from '../src/modules/students/student.repository';
import { createAcademy, createTestApp, createUser, readCookies, removeAcademy } from './helpers';

// US-27 (SCRUM-45). A Held session that crosses 2 left, 1 left or Due tells the active admins
// once. The summary is built before any claim, so a bug in the text does not undo the Held mark.

const NOW = new Date('2026-10-22T10:00:00.000Z');

describe('Payment reminders (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let academyId: string;
  let otherAcademyId: string;
  let adminId: string;
  let instructorId: string;
  let inactiveAdminId: string;
  let otherAdminId: string;
  let adminToken: string;
  const password = 'correct-horse-1';
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  const mail = (name: string) => `${name}-${stamp}@test.local`;

  const server = () => app.getHttpServer();
  const api = (path: string) => `/api/v1${path}`;
  const as = (token: string) => ({ Cookie: `access_token=${token}` });

  beforeAll(async () => {
    app = await createTestApp({ loginRateLimit: 1000, now: NOW });
    prisma = app.get(PrismaService);
    academyId = await createAcademy(prisma, 'payment-reminders');
    otherAcademyId = await createAcademy(prisma, 'payment-reminders-other');
    adminId = await createUser(prisma, academyId, {
      name: 'أدمن',
      email: mail('admin'),
      password,
      role: SystemRole.Admin,
    });
    instructorId = await createUser(prisma, academyId, {
      name: 'كريم',
      email: mail('inst'),
      password,
      role: SystemRole.Instructor,
    });
    inactiveAdminId = await createUser(prisma, academyId, {
      name: 'متوقف',
      email: mail('inactive'),
      password,
      role: SystemRole.Admin,
      isActive: false,
    });
    otherAdminId = await createUser(prisma, otherAcademyId, {
      name: 'أدمن تاني',
      email: mail('other'),
      password,
      role: SystemRole.Admin,
    });
    const res = await request(server())
      .post(api('/auth/login'))
      .send({ login: mail('admin'), password })
      .expect(200);
    adminToken = readCookies(res.headers['set-cookie']).access_token.value;
  });

  afterAll(async () => {
    await removeAcademy(prisma, academyId);
    await removeAcademy(prisma, otherAcademyId);
    await app.close();
  });

  async function newGroup(name: string): Promise<Group> {
    const res = await request(server())
      .post(api('/groups'))
      .set(as(adminToken))
      .send({
        name,
        level: 'Scratch 1',
        instructorId,
        startDate: '2026-10-01',
        schedule: [{ weekday: 4, startTime: '17:00', durationMin: 60 }],
      })
      .expect(201);
    return res.body as Group;
  }

  async function newStudent(name: string): Promise<string> {
    const code = Math.random().toString(36).slice(2, 8).toUpperCase();
    const res = await request(server())
      .post(api('/students'))
      .set(as(adminToken))
      .send({ code: `P-${code}`, name, parentName: 'ولي', parentPhone: '01012345678' })
      .expect(201);
    return (res.body as Student).id;
  }

  async function enroll(
    groupId: string,
    studentId: string,
    sessionsPerCycle: number,
    openingCount: number,
  ) {
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
  }

  async function instructorPlan(sessionsPerCycle: number, groupId: string, openingCount: number) {
    await request(server())
      .post(api(`/instructors/${instructorId}/payment-plans`))
      .set(as(adminToken))
      .send({ groupId, sessionsPerCycle, amount: '2000.00', openingCount })
      .expect(201);
  }

  async function sessionsOf(groupId: string, count: number) {
    const rows = await prisma.unscoped.session.findMany({
      where: { groupId },
      orderBy: [{ scheduledAt: 'asc' }, { id: 'asc' }],
    });
    const picked = rows.slice(0, count);
    if (picked.length < count) throw new Error(`Need ${count} sessions`);
    for (let index = 0; index < picked.length; index += 1) {
      await prisma.unscoped.session.update({
        where: { id: picked[index].id },
        data: { scheduledAt: new Date(Date.UTC(2026, 9, 10 + index, 8)) },
      });
    }
    return picked;
  }

  const hold = (id: string) =>
    request(server())
      .post(api(`/sessions/${id}/held`))
      .set(as(adminToken));

  const notes = (userId: string) =>
    prisma.unscoped.notification.findMany({
      where: { userId },
      orderBy: { createdAt: 'asc' },
    });
  const about = async (userId: string, groupName: string) =>
    (await notes(userId)).filter((note) => note.title.includes(groupName));
  const claims = (cycleId: string) =>
    prisma.unscoped.paymentReminder.findMany({
      where: { cycleId },
      orderBy: { sessionsLeft: 'desc' },
    });
  const jobs = () => prisma.unscoped.reminderJob.count({ where: { academyId } });

  it('sends 2 left, then 1 left, then due, once each, and queues one push job per notification', async () => {
    const group = await newGroup('عتبات');
    const studentId = await newStudent('سلمى');
    await enroll(group.id, studentId, 4, 1);
    const [first, second, third, fourth] = await sessionsOf(group.id, 4);
    const jobsBefore = await jobs();

    await hold(first.id).expect(200);
    await hold(second.id).expect(200);
    await hold(third.id).expect(200);
    await hold(fourth.id).expect(200);

    const sent = await about(adminId, 'عتبات');
    expect(sent.map((note) => note.body)).toEqual([
      'فاضلهم حصتين: سلمى',
      'فاضلهم حصة: سلمى',
      'استحقت: سلمى',
    ]);
    expect(sent.every((note) => note.type === NotificationType.StudentPayment)).toBe(true);
    expect(sent[0]?.data).toMatchObject({
      url: '/payments?status=approaching',
      sessionId: first.id,
      groupId: group.id,
    });
    expect(sent[2]?.data).toMatchObject({ url: '/payments?status=due' });
    expect(sent.every((note) => !JSON.stringify(note.data).includes('tab='))).toBe(true);
    const cycle = await prisma.unscoped.paymentCycle.findFirstOrThrow({ where: { studentId } });
    expect(await claims(cycle.id)).toMatchObject([
      { sessionsLeft: 2 },
      { sessionsLeft: 1 },
      { sessionsLeft: 0 },
    ]);
    expect((await jobs()) - jobsBefore).toBe(sent.length);
    expect(await notes(instructorId)).toHaveLength(0);
    expect(await notes(inactiveAdminId)).toHaveLength(0);
    expect(await notes(otherAdminId)).toHaveLength(0);
    expect(
      await prisma.unscoped.paymentReminder.count({ where: { academyId: otherAcademyId } }),
    ).toBe(0);
  });

  it('lists six students in one notification, capped at five', async () => {
    const group = await newGroup('ستة');
    const names = ['ح', 'أ', 'ج', 'ب', 'ث', 'ت'];
    for (const name of names) {
      await enroll(group.id, await newStudent(name), 4, 1);
    }
    const [session] = await sessionsOf(group.id, 1);
    await hold(session.id).expect(200);
    const [note] = await about(adminId, 'ستة');
    const ordered = [...names].sort((a, b) => a.localeCompare(b, 'ar'));
    expect(note?.body).toBe(`فاضلهم حصتين: ${ordered.slice(0, 5).join('، ')} و1 كمان`);
    expect(await about(adminId, 'ستة')).toHaveLength(1);
  });

  it('names the instructor on their own line and opens the instructors tab', async () => {
    const approaching = await newGroup('مدرس قرب');
    await instructorPlan(4, approaching.id, 1);
    const [soon] = await sessionsOf(approaching.id, 1);
    await hold(soon.id).expect(200);
    const [near] = await about(adminId, 'مدرس قرب');
    expect(near?.type).toBe(NotificationType.InstructorPayment);
    expect(near?.body).toBe('فاضلهم حصتين: المدرس كريم');
    expect(near?.data).toMatchObject({ url: '/payments?status=approaching&tab=instructors' });

    const due = await newGroup('مدرس استحق');
    await instructorPlan(2, due.id, 1);
    const [last] = await sessionsOf(due.id, 1);
    await hold(last.id).expect(200);
    const [owed] = await about(adminId, 'مدرس استحق');
    expect(owed?.body).toBe('استحقت: المدرس كريم');
    expect(owed?.data).toMatchObject({ url: '/payments?status=due&tab=instructors' });
  });

  it('uses student_payment when students and the instructor cross together', async () => {
    const group = await newGroup('الاتنين');
    await instructorPlan(4, group.id, 1);
    await enroll(group.id, await newStudent('منى'), 4, 1);
    const [session] = await sessionsOf(group.id, 1);
    await hold(session.id).expect(200);
    const [note] = await about(adminId, 'الاتنين');
    expect(note?.type).toBe(NotificationType.StudentPayment);
    expect(note?.body).toBe('فاضلهم حصتين: منى، المدرس كريم');
    expect(JSON.stringify(note?.data)).not.toContain('tab=');
  });

  it('keeps the session Held when building the summary throws', async () => {
    const group = await newGroup('خطأ');
    const studentId = await newStudent('هدى');
    await enroll(group.id, studentId, 4, 1);
    const [session] = await sessionsOf(group.id, 1);
    const students = app.get(StudentRepository);
    const spy = jest.spyOn(students, 'findNames').mockRejectedValue(new Error('boom'));
    try {
      const res = await hold(session.id).expect(200);
      expect(res.body).toMatchObject({ status: 'held' });
    } finally {
      spy.mockRestore();
    }
    const cycle = await prisma.unscoped.paymentCycle.findFirstOrThrow({ where: { studentId } });
    expect(cycle.sessionsCounted).toBe(2);
    expect(await claims(cycle.id)).toHaveLength(0);
    expect(await about(adminId, 'خطأ')).toHaveLength(0);
  });

  it('does not remind again after an undo and the same threshold', async () => {
    const group = await newGroup('تراجع');
    const studentId = await newStudent('لينا');
    await enroll(group.id, studentId, 4, 1);
    const [session] = await sessionsOf(group.id, 1);
    await hold(session.id).expect(200);
    await request(server())
      .post(api(`/sessions/${session.id}/undo-held`))
      .set(as(adminToken))
      .expect(200);
    await hold(session.id).expect(200);
    expect(await about(adminId, 'تراجع')).toHaveLength(1);
    const cycle = await prisma.unscoped.paymentCycle.findFirstOrThrow({ where: { studentId } });
    expect(await claims(cycle.id)).toHaveLength(1);
  });

  it('sends nothing when a starting point lands on 2 left, or a session is cancelled', async () => {
    const group = await newGroup('بداية');
    const studentId = await newStudent('يارا');
    await enroll(group.id, studentId, 4, 0);
    const cycle = await prisma.unscoped.paymentCycle.findFirstOrThrow({ where: { studentId } });
    await request(server())
      .put(api(`/payment-cycles/${cycle.id}/starting-point`))
      .set(as(adminToken))
      .send({ openingCount: 2 })
      .expect(200);
    const [session] = await sessionsOf(group.id, 1);
    await request(server())
      .post(api(`/sessions/${session.id}/cancel`))
      .set(as(adminToken))
      .send({ reason: 'ظرف' })
      .expect(200);
    expect(await about(adminId, 'بداية')).toHaveLength(0);
    expect(await claims(cycle.id)).toHaveLength(0);
  });

  it('sends one notification to each active admin, with the same body', async () => {
    const secondId = await createUser(prisma, academyId, {
      name: 'أدمن تاني',
      email: mail('admin2'),
      password,
      role: SystemRole.Admin,
    });
    try {
      const group = await newGroup('اتنين أدمن');
      await enroll(group.id, await newStudent('تالا'), 4, 1);
      const [session] = await sessionsOf(group.id, 1);
      const jobsBefore = await jobs();
      await hold(session.id).expect(200);
      const first = await about(adminId, 'اتنين أدمن');
      const second = await about(secondId, 'اتنين أدمن');
      expect(first).toHaveLength(1);
      expect(second).toHaveLength(1);
      expect(second[0]?.body).toBe(first[0]?.body);
      expect((await jobs()) - jobsBefore).toBe(2);
    } finally {
      await prisma.unscoped.user.update({ where: { id: secondId }, data: { isActive: false } });
    }
  });
});
