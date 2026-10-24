import type { INestApplication } from '@nestjs/common';
import { SystemRole, type Page, type Payment } from '@kidzzy/shared';
import request from 'supertest';
import type { App } from 'supertest/types';
import { PrismaService } from '../src/modules/prisma/prisma.service';
import { createAcademy, createTestApp, createUser, readCookies, removeAcademy } from './helpers';

// US-24 and US-25 (SCRUM-48): the payment history. An instructor is paid per group (ADR-0015), so
// an instructor's payment names its group. paid_on is an academy-local date: from and to compare
// with it as plain dates, both included, which matters on the day Egypt changes its clock.

const NOW = new Date('2026-11-02T09:00:00.000Z');

describe('Payment history (e2e)', () => {
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

  async function newGroup(instructorId: string, name: string, inAcademy = academyId) {
    return prisma.unscoped.group.create({
      data: {
        academyId: inAcademy,
        name,
        searchText: name,
        level: 'Scratch 1',
        instructorId,
        startDate: new Date('2026-10-01T00:00:00.000Z'),
      },
    });
  }

  async function makeDue(cycleId: string) {
    const cycle = await prisma.unscoped.paymentCycle.findUniqueOrThrow({ where: { id: cycleId } });
    await prisma.unscoped.paymentCycle.update({
      where: { id: cycleId },
      data: { status: 'due', sessionsCounted: cycle.sessionsPerCycle, dueAt: NOW },
    });
  }

  const pay = (cycleId: string, paidOn: string, method = 'cash', amount = '1500.00') =>
    request(server())
      .post(api(`/payment-cycles/${cycleId}/payments`))
      .set(as(adminToken))
      .send({ amount, paidOn, method });

  /** An instructor's cycle for one group, Due, then paid on that day. */
  async function paidInstructor(instructorId: string, groupName: string, paidOn: string) {
    const group = await newGroup(instructorId, groupName);
    await request(server())
      .post(api(`/instructors/${instructorId}/payment-plans`))
      .set(as(adminToken))
      .send({ groupId: group.id, sessionsPerCycle: 4, amount: '1500.00' })
      .expect(201);
    const cycle = await prisma.unscoped.paymentCycle.findFirstOrThrow({
      where: { instructorId, groupId: group.id },
    });
    await makeDue(cycle.id);
    return (await pay(cycle.id, paidOn).expect(201)).body as Payment;
  }

  /** A student's cycle, Due, then paid on that day. */
  async function paidStudent(name: string, paidOn: string) {
    count += 1;
    const group = await newGroup(anaId, `جروب الطالب ${count}`);
    const student = await prisma.unscoped.student.create({
      data: {
        academyId,
        code: `H-${count}`,
        name,
        nameSearch: name,
        parentName: 'Parent',
        parentPhone: '+201000000000',
      },
    });
    await request(server())
      .post(api(`/groups/${group.id}/enrollments`))
      .set(as(adminToken))
      .send({
        studentId: student.id,
        startDate: '2026-10-01',
        plan: { sessionsPerCycle: 4, amount: '900.00' },
      })
      .expect(201);
    const cycle = await prisma.unscoped.paymentCycle.findFirstOrThrow({
      where: { studentId: student.id },
    });
    await makeDue(cycle.id);
    return {
      studentId: student.id,
      payment: (await pay(cycle.id, paidOn, 'transfer', '900.00').expect(201)).body as Payment,
    };
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

  const list = (query: Record<string, string | number> = {}, token = adminToken) =>
    request(server()).get(api('/payments')).query(query).set(as(token));
  const payments = async (query: Record<string, string | number> = {}, token = adminToken) =>
    (await list(query, token).expect(200)).body as Page<Payment>;

  beforeAll(async () => {
    app = await createTestApp({ loginRateLimit: 1000, now: NOW });
    prisma = app.get(PrismaService);
    academyId = await createAcademy(prisma, 'payments-list');
    otherAcademyId = await createAcademy(prisma, 'payments-list-other');
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

  it('shows whose cycle each payment settled, with the group of an instructor’s', async () => {
    const instructor = await newInstructor('مدرس السجل');
    const instructorPayment = await paidInstructor(instructor, 'جروب السجل', '2026-10-20');
    const { studentId, payment: studentPayment } = await paidStudent('طالب السجل', '2026-10-21');

    const forInstructor = await payments({ instructorId: instructor });
    expect(forInstructor.data).toEqual([
      expect.objectContaining({
        id: instructorPayment.id,
        payeeType: 'instructor',
        payeeId: instructor,
        payeeName: 'مدرس السجل',
        groupName: 'جروب السجل',
        groupId: expect.any(String) as string,
        cycleNumber: 1,
        amount: '1500.00',
        paidOn: '2026-10-20',
        method: 'cash',
        recordedBy: expect.objectContaining({ name: 'admin' }) as unknown,
      }),
    ]);
    const forStudent = await payments({ studentId });
    expect(forStudent.data).toEqual([
      expect.objectContaining({
        id: studentPayment.id,
        payeeType: 'student',
        payeeId: studentId,
        payeeName: 'طالب السجل',
        groupId: null,
        groupName: null,
        amount: '900.00',
        method: 'transfer',
      }),
    ]);
  });

  describe('filters', () => {
    it('filters by payee type and combines the filters with AND', async () => {
      const instructor = await newInstructor();
      await paidInstructor(instructor, 'جروب أ', '2026-10-10');
      const { studentId } = await paidStudent('طالب الفلتر', '2026-10-11');

      const instructors = await payments({ payeeType: 'instructor', instructorId: instructor });
      expect(instructors.data.every((p) => p.payeeType === 'instructor')).toBe(true);
      expect(instructors.data).toHaveLength(1);
      expect((await payments({ payeeType: 'student', studentId })).data).toHaveLength(1);
      expect((await payments({ payeeType: 'student', instructorId: instructor })).data).toEqual([]);
    });

    it('bounds by academy-local dates, both included, around the day Egypt changes its clock', async () => {
      const instructor = await newInstructor();
      const days = ['2026-10-29', '2026-10-30', '2026-10-31'];
      const paid: Payment[] = [];
      for (const [index, day] of days.entries()) {
        paid.push(await paidInstructor(instructor, 'جروب ' + String(index), day));
      }

      const days_ = async (query: Record<string, string>) =>
        (await payments({ instructorId: instructor, ...query })).data.map((p) => p.paidOn);
      expect(await days_({ from: '2026-10-30', to: '2026-10-30' })).toEqual(['2026-10-30']);
      expect(await days_({ from: '2026-10-30' })).toEqual(['2026-10-31', '2026-10-30']);
      expect(await days_({ to: '2026-10-30' })).toEqual(['2026-10-30', '2026-10-29']);
      expect(await days_({})).toEqual(['2026-10-31', '2026-10-30', '2026-10-29']);
      expect(paid).toHaveLength(3);
    });

    it('lists newest first: the later day first, and on one day the one recorded last', async () => {
      const instructor = await newInstructor();
      const older = await paidInstructor(instructor, 'جروب قديم', '2026-10-05');
      const first = await paidInstructor(instructor, 'جروب اول', '2026-10-15');
      const second = await paidInstructor(instructor, 'جروب تاني', '2026-10-15');

      const ids = (await payments({ instructorId: instructor })).data.map((p) => p.id);
      expect(ids).toEqual([second.id, first.id, older.id]);
    });

    it('pages the list', async () => {
      const instructor = await newInstructor();
      for (const [index, day] of ['2026-10-01', '2026-10-02', '2026-10-03'].entries()) {
        await paidInstructor(instructor, 'جروب صفحة ' + String(index), day);
      }

      const first = await payments({ instructorId: instructor, pageSize: 2 });
      expect(first.meta).toEqual({ page: 1, pageSize: 2, total: 3 });
      expect(first.data).toHaveLength(2);
      const second = await payments({ instructorId: instructor, pageSize: 2, page: 2 });
      expect(second.data).toHaveLength(1);
      expect(second.data[0]?.paidOn).toBe('2026-10-01');
    });

    it.each([
      ['from after to', { from: '2026-10-31', to: '2026-10-30' }],
      ['a date that is not real', { from: '2026-02-30' }],
      ['text instead of a date', { to: 'yesterday' }],
      ['an unknown payee type', { payeeType: 'parent' }],
      ['an instructorId that is not an id', { instructorId: 'nope' }],
      ['page 0', { page: 0 }],
      ['101 per page', { pageSize: 101 }],
    ])('refuses %s (400)', async (_label, query) => {
      await list(query).expect(400);
    });
  });

  describe('scope own (an instructor reads their own payments only)', () => {
    it('without a filter, returns their own payments with the group of each', async () => {
      await paidInstructor(anaId, 'جروب انا للدفع', '2026-10-12');
      const other = await newInstructor();
      await paidInstructor(other, 'جروب غيرها', '2026-10-13');

      const page = await payments({}, anaToken);
      expect(page.data.length).toBeGreaterThan(0);
      expect(page.data.every((p) => p.payeeId === anaId && p.groupId !== null)).toBe(true);
      expect(page.data.map((p) => p.groupName)).toContain('جروب انا للدفع');
    });

    it('accepts their own id and the date range on their own payments', async () => {
      await paidInstructor(anaId, 'جروب انا بالتاريخ', '2026-10-14');
      const page = await payments(
        { instructorId: anaId, from: '2026-10-14', to: '2026-10-14' },
        anaToken,
      );
      expect(page.data.map((p) => p.groupName)).toContain('جروب انا بالتاريخ');
    });

    it('refuses another instructor’s payments, and every student’s (403)', async () => {
      const other = await newInstructor();
      const { studentId } = await paidStudent('طالب ممنوع', '2026-10-16');
      await list({ instructorId: other }, anaToken).expect(403);
      await list({ payeeType: 'student' }, anaToken).expect(403);
      await list({ studentId }, anaToken).expect(403);
    });
  });

  describe('academies', () => {
    it('never shows another academy’s payments', async () => {
      const instructor = await newInstructor();
      await paidInstructor(instructor, 'جروب الاكاديمية', '2026-10-17');

      expect((await payments({ instructorId: instructor }, otherAdminToken)).data).toEqual([]);
      const all = await payments({ pageSize: 100 }, otherAdminToken);
      expect(all.data.every((p) => p.payeeId !== instructor)).toBe(true);
    });
  });
});
