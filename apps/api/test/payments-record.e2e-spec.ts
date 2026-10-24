import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { SystemRole, type Payment, type PaymentCycle } from '@kidzzy/shared';
import request from 'supertest';
import type { App } from 'supertest/types';
import { Prisma } from '../src/generated/prisma/client';
import { PrismaService } from '../src/modules/prisma/prisma.service';
import { createAcademy, createTestApp, createUser, readCookies, removeAcademy } from './helpers';

// US-23 (SCRUM-40): record the payment of a Due cycle. One payment settles one full cycle (BR-09):
// the amount equals the plan's, a second payment is refused, and the date is an academy-local day
// that is not after today.

// 22:30 UTC on the 24th is 01:30 on the 25th in Cairo (UTC+3), so "today" is the 25th locally.
const NOW = new Date('2026-10-24T22:30:00.000Z');
const TODAY = '2026-10-25';
type ErrorResponse = { code: string; errors?: { field: string }[] };

describe('Recording a payment (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let academyId: string;
  let otherAcademyId: string;
  let adminId: string;
  let adminToken: string;
  let anaId: string;
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

  async function newInstructor() {
    count += 1;
    return createUser(prisma, academyId, {
      name: `مدرس ${count}`,
      email: mail(`inst${count}`),
      password,
      role: SystemRole.Instructor,
    });
  }

  async function newGroup(instructorId: string) {
    count += 1;
    const name = `جروب ${count}`;
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

  /** Makes the cycle Due the way counting would: N of N, with the time it became due. */
  async function makeDue(cycleId: string) {
    const cycle = await prisma.unscoped.paymentCycle.findUniqueOrThrow({ where: { id: cycleId } });
    await prisma.unscoped.paymentCycle.update({
      where: { id: cycleId },
      data: { status: 'due', sessionsCounted: cycle.sessionsPerCycle, dueAt: NOW },
    });
  }

  /** An instructor's cycle for one group (ADR-0015), in progress, with the plan amount. */
  async function instructorCycle(amount = '1500.00', due = true) {
    const instructor = await newInstructor();
    const group = await newGroup(instructor);
    await request(server())
      .post(api(`/instructors/${instructor}/payment-plans`))
      .set(as(adminToken))
      .send({ groupId: group.id, sessionsPerCycle: 4, amount })
      .expect(201);
    const cycle = await prisma.unscoped.paymentCycle.findFirstOrThrow({
      where: { instructorId: instructor, groupId: group.id },
    });
    if (due) await makeDue(cycle.id);
    return cycle.id;
  }

  /** A student's cycle, started by an enrollment with a plan. */
  async function studentCycle(amount = '900.00', due = true) {
    count += 1;
    const group = await newGroup(await newInstructor());
    const student = await prisma.unscoped.student.create({
      data: {
        academyId,
        code: `R-${count}`,
        name: `طالب ${count}`,
        nameSearch: `طالب ${count}`,
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
        plan: { sessionsPerCycle: 4, amount },
      })
      .expect(201);
    const cycle = await prisma.unscoped.paymentCycle.findFirstOrThrow({
      where: { studentId: student.id },
    });
    if (due) await makeDue(cycle.id);
    return cycle.id;
  }

  const pay = (cycleId: string, body: Record<string, unknown>, token = adminToken) =>
    request(server())
      .post(api(`/payment-cycles/${cycleId}/payments`))
      .set(as(token))
      .send(body);
  const valid = { amount: '1500.00', paidOn: TODAY, method: 'cash' };
  const payments = (cycleId: string) => prisma.unscoped.payment.findMany({ where: { cycleId } });
  const cycleRow = (id: string) =>
    prisma.unscoped.paymentCycle.findUniqueOrThrow({ where: { id } });

  beforeAll(async () => {
    app = await createTestApp({ loginRateLimit: 1000, now: NOW });
    prisma = app.get(PrismaService);
    academyId = await createAcademy(prisma, 'payments-record');
    otherAcademyId = await createAcademy(prisma, 'payments-record-other');
    adminId = await createUser(prisma, academyId, {
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

  describe('a Due cycle', () => {
    it('records the payment of an instructor’s cycle (per group) and marks the cycle paid', async () => {
      const cycleId = await instructorCycle();
      const res = await pay(cycleId, { ...valid, note: '  Cash in hand  ' }).expect(201);

      expect(res.body).toEqual({
        id: expect.any(String) as string,
        cycleId,
        amount: '1500.00',
        paidOn: TODAY,
        method: 'cash',
        note: 'Cash in hand',
        recordedBy: { id: adminId, name: 'admin' },
        createdAt: NOW.toISOString(),
      });
      const rows = await payments(cycleId);
      expect(rows).toHaveLength(1);
      expect(rows[0]?.amount.equals(new Prisma.Decimal('1500.00'))).toBe(true);
      expect(rows[0]).toMatchObject({ method: 'cash', recordedById: adminId, academyId });
      expect(await cycleRow(cycleId)).toMatchObject({ status: 'paid', paidAt: NOW });
    });

    it('records the payment of a student’s cycle too', async () => {
      const cycleId = await studentCycle('900.50');
      await pay(cycleId, { amount: '900.50', paidOn: '2026-10-20', method: 'wallet' }).expect(201);

      expect(await cycleRow(cycleId)).toMatchObject({ status: 'paid' });
      expect((await payments(cycleId))[0]).toMatchObject({ method: 'wallet', note: null });
    });

    it('shows the cycle as paid in the cycles list afterwards', async () => {
      const cycleId = await instructorCycle();
      await pay(cycleId, valid).expect(201);

      const res = await request(server())
        .get(api('/payment-cycles'))
        .query({ status: 'paid', pageSize: 100 })
        .set(as(adminToken))
        .expect(200);
      const found = (res.body as { data: PaymentCycle[] }).data.find((c) => c.id === cycleId);
      expect(found).toMatchObject({ status: 'paid' });
      expect(found?.paidAt).toBe(NOW.toISOString());
    });
  });

  describe('only a Due cycle', () => {
    it('refuses a cycle still in progress (409 CYCLE_NOT_DUE) and writes nothing', async () => {
      const cycleId = await instructorCycle('1500.00', false);
      const res = await pay(cycleId, valid).expect(409);
      expect((res.body as ErrorResponse).code).toBe('CYCLE_NOT_DUE');
      expect(await payments(cycleId)).toHaveLength(0);
      expect(await cycleRow(cycleId)).toMatchObject({ status: 'in_progress', paidAt: null });
    });

    it('refuses a second payment of a paid cycle (409 CYCLE_ALREADY_PAID)', async () => {
      const cycleId = await studentCycle();
      await pay(cycleId, { ...valid, amount: '900.00' }).expect(201);
      const res = await pay(cycleId, { ...valid, amount: '900.00' }).expect(409);
      expect((res.body as ErrorResponse).code).toBe('CYCLE_ALREADY_PAID');
      expect(await payments(cycleId)).toHaveLength(1);
    });
  });

  describe('the amount', () => {
    it.each([
      ['one piaster less', '1499.99'],
      ['one piaster more', '1500.01'],
      ['a different amount', '900.00'],
    ])(
      'must equal the plan amount: %s is 422 AMOUNT_MISMATCH on the amount field',
      async (_label, amount) => {
        const cycleId = await instructorCycle('1500.00');
        const res = await pay(cycleId, { ...valid, amount }).expect(422);
        expect(res.body).toMatchObject({
          code: 'AMOUNT_MISMATCH',
          errors: [{ field: 'amount' }],
        });
        expect(await payments(cycleId)).toHaveLength(0);
        expect(await cycleRow(cycleId)).toMatchObject({ status: 'due' });
      },
    );

    it('is compared as a decimal: 1500.10 matches a plan of 1500.1 stored as 1500.10', async () => {
      const cycleId = await instructorCycle('1500.10');
      await pay(cycleId, { ...valid, amount: '1500.10' }).expect(201);
    });
  });

  describe('the date', () => {
    it('allows today in the academy’s timezone (the 25th here, though it is the 24th in UTC)', async () => {
      const cycleId = await instructorCycle();
      await pay(cycleId, { ...valid, paidOn: TODAY }).expect(201);
    });

    it('allows a past date', async () => {
      const cycleId = await instructorCycle();
      await pay(cycleId, { ...valid, paidOn: '2026-01-05' }).expect(201);
      expect((await payments(cycleId))[0]?.paidOn.toISOString().slice(0, 10)).toBe('2026-01-05');
    });

    it('refuses a date after today (422 PAID_ON_IN_FUTURE on the paidOn field), writing nothing', async () => {
      const cycleId = await instructorCycle();
      const res = await pay(cycleId, { ...valid, paidOn: '2026-10-26' }).expect(422);
      expect(res.body).toMatchObject({
        code: 'PAID_ON_IN_FUTURE',
        errors: [{ field: 'paidOn' }],
      });
      expect(await payments(cycleId)).toHaveLength(0);
    });
  });

  describe('the note', () => {
    it('is stored trimmed, and a blank note is stored as null', async () => {
      const trimmed = await instructorCycle();
      await pay(trimmed, { ...valid, note: '  ref 123  ' }).expect(201);
      expect((await payments(trimmed))[0]?.note).toBe('ref 123');

      const blank = await instructorCycle();
      const res = await pay(blank, { ...valid, note: '   ' }).expect(201);
      expect((res.body as Payment).note).toBeNull();
      expect((await payments(blank))[0]?.note).toBeNull();
    });
  });

  describe('refusals', () => {
    it.each([
      ['an amount as a number', { ...valid, amount: 1500 }],
      ['an amount without cents', { ...valid, amount: '1500' }],
      ['an amount of zero', { ...valid, amount: '0.00' }],
      ['a date that is not real', { ...valid, paidOn: '2026-02-30' }],
      ['a date in the wrong format', { ...valid, paidOn: '25/10/2026' }],
      ['an unknown method', { ...valid, method: 'bitcoin' }],
      ['no method', { amount: '1500.00', paidOn: TODAY }],
      ['a note over 500 characters', { ...valid, note: 'x'.repeat(501) }],
      ['an unknown field', { ...valid, cycleId: randomUUID() }],
    ])('refuses %s (400)', async (_label, body) => {
      const cycleId = await instructorCycle();
      await pay(cycleId, body).expect(400);
      expect(await payments(cycleId)).toHaveLength(0);
    });

    it('is 403 for an instructor, even for their own cycle (payments.manage is the admin’s)', async () => {
      const group = await newGroup(anaId);
      await request(server())
        .post(api(`/instructors/${anaId}/payment-plans`))
        .set(as(adminToken))
        .send({ groupId: group.id, sessionsPerCycle: 4, amount: '1500.00' })
        .expect(201);
      const cycle = await prisma.unscoped.paymentCycle.findFirstOrThrow({
        where: { instructorId: anaId, groupId: group.id },
      });
      await makeDue(cycle.id);

      await pay(cycle.id, valid, anaToken).expect(403);
      expect(await payments(cycle.id)).toHaveLength(0);
    });

    it('is 404 for an unknown cycle and for another academy’s', async () => {
      const cycleId = await instructorCycle();
      await pay(randomUUID(), valid).expect(404);
      await pay(cycleId, valid, otherAdminToken).expect(404);
      expect(await payments(cycleId)).toHaveLength(0);
    });
  });

  describe('two layers of protection against a double payment', () => {
    it('two payments of the same cycle at once: one 201, one 409, one row', async () => {
      const cycleId = await instructorCycle();
      const results = await Promise.all([pay(cycleId, valid), pay(cycleId, valid)]);

      expect(results.map((r) => r.status).sort()).toEqual([201, 409]);
      const refused = results.find((r) => r.status === 409);
      expect((refused?.body as ErrorResponse).code).toBe('CYCLE_ALREADY_PAID');
      expect(await payments(cycleId)).toHaveLength(1);
      expect(await cycleRow(cycleId)).toMatchObject({ status: 'paid' });
    });

    it('the database itself refuses a second payment row for a cycle (UNIQUE cycle_id)', async () => {
      const cycleId = await instructorCycle();
      await pay(cycleId, valid).expect(201);
      await expect(
        prisma.unscoped.payment.create({
          data: {
            academyId,
            cycleId,
            amount: new Prisma.Decimal('1500.00'),
            paidOn: new Date('2026-10-20T00:00:00.000Z'),
            method: 'cash',
            recordedById: adminId,
          },
        }),
      ).rejects.toThrow();
      expect(await payments(cycleId)).toHaveLength(1);
    });
  });

  describe('database constraints', () => {
    const row = (cycleId: string, data: Record<string, unknown> = {}) =>
      prisma.unscoped.payment.create({
        data: {
          academyId,
          cycleId,
          amount: new Prisma.Decimal('1500.00'),
          paidOn: new Date('2026-10-20T00:00:00.000Z'),
          method: 'cash',
          recordedById: adminId,
          ...data,
        },
      });

    it.each([
      ['an amount of zero', { amount: new Prisma.Decimal('0') }],
      ['a negative amount', { amount: new Prisma.Decimal('-1.00') }],
      ['a note that is not trimmed', { note: ' padded ' }],
      ['a blank note', { note: '   ' }],
    ])('refuses a payment with %s', async (_label, data) => {
      const cycleId = await instructorCycle();
      await expect(row(cycleId, data)).rejects.toThrow();
    });

    it('refuses a payment recorded by a user of another academy, or for another academy’s cycle', async () => {
      const cycleId = await instructorCycle();
      const outsider = await prisma.unscoped.user.findFirstOrThrow({
        where: { academyId: otherAcademyId },
      });
      await expect(row(cycleId, { recordedById: outsider.id })).rejects.toThrow();
      await expect(row(cycleId, { academyId: otherAcademyId })).rejects.toThrow();
    });

    it('accepts a well-formed payment (the checks do not refuse everything)', async () => {
      const cycleId = await instructorCycle();
      await expect(row(cycleId, { note: 'ok' })).resolves.toMatchObject({ method: 'cash' });
    });
  });
});
