import type { INestApplication } from '@nestjs/common';
import { SystemRole, type Page, type PaymentCycle, type PaymentPlan } from '@kidzzy/shared';
import request from 'supertest';
import type { App } from 'supertest/types';
import { PrismaService } from '../src/modules/prisma/prisma.service';
import { createAcademy, createTestApp, createUser, readCookies, removeAcademy } from './helpers';

// US-24 and US-25 (SCRUM-48, SCRUM-49): reading the payment cycles. An instructor is paid per
// group (ADR-0015), so an instructor has a line of cycles per group; each cycle shows the starting
// point it began from (BR-14).

const NOW = new Date('2026-10-24T09:00:00.000Z');

describe('Payment cycles list (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let academyId: string;
  let otherAcademyId: string;
  let anaId: string;
  let adminToken: string;
  let anaToken: string;
  let otherAdminToken: string;
  const password = 'correct-horse-1';
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  const mail = (name: string) => `${name}-${stamp}@test.local`;
  let count = 0;

  const server = () => app.getHttpServer();
  const as = (token: string) => ({ Cookie: `access_token=${token}` });
  const api = (path: string) => `/api/v1${path}`;

  async function signIn(email: string) {
    const res = await request(server())
      .post(api('/auth/login'))
      .send({ login: email, password })
      .expect(200);
    return readCookies(res.headers['set-cookie']).access_token.value;
  }

  async function newInstructor(name?: string) {
    count += 1;
    return createUser(prisma, academyId, {
      name: name ?? `مدرس ${count}`,
      email: mail(`inst${count}`),
      password,
      role: SystemRole.Instructor,
    });
  }

  async function newGroup(instructorId: string, name: string, inAcademy = academyId) {
    return prisma.unscoped.group.create({
      data: {
        academyId: inAcademy,
        name,
        searchText: name.toLowerCase(),
        level: 'Scratch 1',
        instructorId,
        startDate: new Date('2026-10-01T00:00:00.000Z'),
      },
    });
  }

  /** The instructor's plan for a group, which opens that group's cycle 1 at the starting point. */
  async function plan(
    instructorId: string,
    groupId: string,
    sessionsPerCycle: number,
    openingCount = 0,
  ) {
    const res = await request(server())
      .post(api(`/instructors/${instructorId}/payment-plans`))
      .set(as(adminToken))
      .send({ groupId, sessionsPerCycle, amount: '2000.00', openingCount })
      .expect(201);
    return res.body as PaymentPlan;
  }

  async function newStudent(name = 'Student') {
    count += 1;
    return prisma.unscoped.student.create({
      data: {
        academyId,
        code: `P-${count}`,
        name,
        nameSearch: name.toLowerCase(),
        parentName: 'Parent',
        parentPhone: '+201000000000',
      },
    });
  }

  const list = (query: Record<string, string | number> = {}, token = adminToken) =>
    request(server()).get(api('/payment-cycles')).query(query).set(as(token));
  const cycles = async (query: Record<string, string | number> = {}, token = adminToken) =>
    (await list(query, token).expect(200)).body as Page<PaymentCycle>;

  beforeAll(async () => {
    app = await createTestApp({ loginRateLimit: 1000, now: NOW });
    prisma = app.get(PrismaService);
    academyId = await createAcademy(prisma, 'payment-cycles');
    otherAcademyId = await createAcademy(prisma, 'payment-cycles-other');
    await createUser(prisma, academyId, {
      name: 'admin',
      email: mail('admin'),
      password,
      role: SystemRole.Admin,
    });
    anaId = await createUser(prisma, academyId, {
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
    adminToken = await signIn(mail('admin'));
    anaToken = await signIn(mail('ana'));
    otherAdminToken = await signIn(mail('other-admin'));
  });

  afterAll(async () => {
    await removeAcademy(prisma, academyId);
    await removeAcademy(prisma, otherAcademyId);
    await app.close();
  });

  describe('an instructor’s cycles, one line per group', () => {
    it('shows each group’s cycle with its counter and the starting point it began from', async () => {
      const instructor = await newInstructor('مدرس البداية');
      const eight = await newGroup(instructor, 'ب جروب 8');
      const four = await newGroup(instructor, 'أ جروب 4');
      await plan(instructor, eight.id, 8, 3);
      await plan(instructor, four.id, 4);

      const page = await cycles({ instructorId: instructor });
      expect(page.meta).toEqual({ page: 1, pageSize: 20, total: 2 });
      expect(page.data).toEqual([
        {
          id: expect.any(String) as string,
          payeeType: 'instructor',
          payeeId: instructor,
          payeeName: 'مدرس البداية',
          groupId: four.id,
          groupName: 'أ جروب 4',
          cycleNumber: 1,
          sessionsPerCycle: 4,
          amount: '2000.00',
          openingCount: 0,
          sessionsCounted: 0,
          status: 'in_progress',
          dueAt: null,
          paidAt: null,
        },
        {
          id: expect.any(String) as string,
          payeeType: 'instructor',
          payeeId: instructor,
          payeeName: 'مدرس البداية',
          groupId: eight.id,
          groupName: 'ب جروب 8',
          cycleNumber: 1,
          sessionsPerCycle: 8,
          amount: '2000.00',
          openingCount: 3,
          sessionsCounted: 3,
          status: 'in_progress',
          dueAt: null,
          paidAt: null,
        },
      ]);
    });

    it('lists a group’s latest cycle first', async () => {
      const instructor = await newInstructor();
      const group = await newGroup(instructor, 'جروب الدورات');
      const first = await plan(instructor, group.id, 2);
      await prisma.unscoped.paymentCycle.updateMany({
        where: { instructorId: instructor, groupId: group.id },
        data: { status: 'due', sessionsCounted: 2, dueAt: NOW },
      });
      await prisma.unscoped.paymentCycle.create({
        data: {
          academyId,
          payeeType: 'instructor',
          instructorId: instructor,
          instructorAcademyId: academyId,
          groupId: group.id,
          groupAcademyId: academyId,
          planId: first.id,
          sessionsPerCycle: 2,
          cycleNumber: 2,
          sessionsCounted: 1,
        },
      });

      const page = await cycles({ instructorId: instructor });
      expect(page.data.map((c) => [c.cycleNumber, c.status, c.sessionsCounted])).toEqual([
        [2, 'in_progress', 1],
        [1, 'due', 2],
      ]);
    });
  });

  describe('a student’s cycle', () => {
    it('has no group, and shows its starting point', async () => {
      const student = await newStudent('طالب البداية');
      const instructor = await newInstructor();
      const group = await newGroup(instructor, 'جروب الطالب');
      await request(server())
        .post(api(`/groups/${group.id}/enrollments`))
        .set(as(adminToken))
        .send({
          studentId: student.id,
          startDate: '2026-10-01',
          plan: { sessionsPerCycle: 8, amount: '1500.00' },
          openingCount: 3,
        })
        .expect(201);

      const page = await cycles({ studentId: student.id });
      expect(page.data).toHaveLength(1);
      expect(page.data[0]).toMatchObject({
        payeeType: 'student',
        payeeId: student.id,
        payeeName: 'طالب البداية',
        groupId: null,
        groupName: null,
        sessionsPerCycle: 8,
        amount: '1500.00',
        openingCount: 3,
        sessionsCounted: 3,
      });
    });
  });

  describe('filters', () => {
    it('filters by payee type, and combines filters with AND', async () => {
      const instructor = await newInstructor();
      const group = await newGroup(instructor, 'جروب الفلتر');
      await plan(instructor, group.id, 4);
      const student = await newStudent();
      await request(server())
        .post(api(`/groups/${group.id}/enrollments`))
        .set(as(adminToken))
        .send({
          studentId: student.id,
          startDate: '2026-10-01',
          plan: { sessionsPerCycle: 4, amount: '900.00' },
        })
        .expect(201);

      const instructors = await cycles({ payeeType: 'instructor', instructorId: instructor });
      expect(instructors.data.map((c) => c.payeeType)).toEqual(['instructor']);
      const students = await cycles({ payeeType: 'student', studentId: student.id });
      expect(students.data.map((c) => c.payeeType)).toEqual(['student']);
      const none = await cycles({ payeeType: 'student', instructorId: instructor });
      expect(none.data).toEqual([]);
    });

    it('filters by status: in progress, approaching (one or two sessions left), due and paid', async () => {
      const instructor = await newInstructor();
      const [closing, far, finished, settled] = [
        await newGroup(instructor, 'ج قريبة'),
        await newGroup(instructor, 'ج بعيدة'),
        await newGroup(instructor, 'ج مستحقة'),
        await newGroup(instructor, 'ج مدفوعة'),
      ];
      await plan(instructor, closing.id, 4, 2); // 2 left
      await plan(instructor, far.id, 8, 1); // 7 left
      await plan(instructor, finished.id, 4);
      await plan(instructor, settled.id, 4);
      await prisma.unscoped.paymentCycle.updateMany({
        where: { instructorId: instructor, groupId: finished.id },
        data: { status: 'due', sessionsCounted: 4, dueAt: NOW },
      });
      await prisma.unscoped.paymentCycle.updateMany({
        where: { instructorId: instructor, groupId: settled.id },
        data: { status: 'paid', sessionsCounted: 4, dueAt: NOW, paidAt: NOW },
      });

      const names = async (status: string) =>
        (await cycles({ instructorId: instructor, status })).data.map((c) => c.groupName);
      expect((await names('in_progress')).sort()).toEqual(['ج بعيدة', 'ج قريبة'].sort());
      expect(await names('approaching')).toEqual(['ج قريبة']);
      expect(await names('due')).toEqual(['ج مستحقة']);
      expect(await names('paid')).toEqual(['ج مدفوعة']);
    });

    it('pages the list', async () => {
      const instructor = await newInstructor();
      for (const name of ['1', '2', '3']) {
        await plan(instructor, (await newGroup(instructor, 'جروب ' + name)).id, 4);
      }

      const first = await cycles({ instructorId: instructor, pageSize: 2 });
      expect(first.meta).toEqual({ page: 1, pageSize: 2, total: 3 });
      expect(first.data).toHaveLength(2);
      const second = await cycles({ instructorId: instructor, pageSize: 2, page: 2 });
      expect(second.data).toHaveLength(1);
    });

    it.each([
      ['an unknown status', { status: 'late' }],
      ['an unknown payee type', { payeeType: 'parent' }],
      ['an instructorId that is not an id', { instructorId: 'nope' }],
      ['a studentId that is not an id', { studentId: 'nope' }],
      ['page 0', { page: 0 }],
      ['101 per page', { pageSize: 101 }],
    ])('refuses %s (400)', async (_label, query) => {
      await list(query).expect(400);
    });
  });

  describe('scope own (an instructor reads their own cycles only)', () => {
    it('without a filter, returns their own cycles, group by group', async () => {
      const group = await newGroup(anaId, 'جروب انا');
      await plan(anaId, group.id, 6, 2);
      const other = await newInstructor();
      await plan(other, (await newGroup(other, 'جروب غيرها')).id, 6);

      const page = await cycles({}, anaToken);
      expect(page.data.length).toBeGreaterThan(0);
      expect(page.data.every((c) => c.payeeId === anaId && c.groupId !== null)).toBe(true);
      expect(page.data.find((c) => c.groupName === 'جروب انا')).toMatchObject({
        openingCount: 2,
        sessionsCounted: 2,
        sessionsPerCycle: 6,
      });
    });

    it('accepts their own id and the filters on their own cycles', async () => {
      const group = await newGroup(anaId, 'جروب انا 2');
      await plan(anaId, group.id, 4, 3); // one session left
      const page = await cycles({ instructorId: anaId, status: 'approaching' }, anaToken);
      expect(page.data.map((c) => c.groupName)).toContain('جروب انا 2');
      expect(page.data.every((c) => c.payeeId === anaId)).toBe(true);
    });

    it('refuses another instructor’s cycles, and every student’s (403)', async () => {
      const other = await newInstructor();
      const student = await newStudent();
      await list({ instructorId: other }, anaToken).expect(403);
      await list({ payeeType: 'student' }, anaToken).expect(403);
      await list({ studentId: student.id }, anaToken).expect(403);
    });
  });

  describe('academies', () => {
    it('never shows another academy’s cycles', async () => {
      const instructor = await newInstructor();
      await plan(instructor, (await newGroup(instructor, 'جروب الاكاديمية')).id, 4);

      const theirs = await cycles({ instructorId: instructor }, otherAdminToken);
      expect(theirs.data).toEqual([]);
      const all = await cycles({}, otherAdminToken);
      expect(all.data.every((c) => c.payeeId !== instructor)).toBe(true);
    });
  });
});
