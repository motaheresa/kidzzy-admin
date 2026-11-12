import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import type { INestApplication } from '@nestjs/common';
import {
  SystemRole,
  type FinanceReport,
  type InstructorsReport,
  type OverviewReport,
  type Page,
  type SessionsReport,
  type Payment,
} from '@kidzzy/shared';
import request from 'supertest';
import type { App } from 'supertest/types';
import { PrismaService } from '../src/modules/prisma/prisma.service';
import { createAcademy, createTestApp, createUser, readCookies, removeAcademy } from './helpers';

// US-38 (SCRUM-82): the reports workspace. "Now" is 2026-11-12 10:00 in Cairo (UTC+2, so winter
// time until the end of the year); the generator has covered through 2026-12-09 (4 weeks).
// A Cairo 17:00 session is 15:00Z. 2026-11-12 is a Thursday.
const NOW = new Date('2026-11-12T08:00:00.000Z');
const at = (day: string) => `${day}T15:00:00.000Z`;

interface Setup {
  academyId: string;
  adminToken: string;
  anaToken: string;
  anaId: string;
  omarId: string;
}

describe('Reports (e2e)', () => {
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

  /** A new academy with an admin and two instructors, so each test starts clean. */
  async function setup(label: string): Promise<Setup> {
    const academyId = await createAcademy(prisma, `reports-${label}`);
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
    const omarId = await createUser(prisma, academyId, {
      name: 'omar',
      email: mail('omar', label),
      password,
      role: SystemRole.Instructor,
    });
    return {
      academyId,
      adminToken: await signIn(mail('admin', label)),
      anaToken: await signIn(mail('ana', label)),
      anaId,
      omarId,
    };
  }

  function group(s: Setup, name: string, instructorId = s.anaId) {
    return prisma.unscoped.group.create({
      data: {
        academyId: s.academyId,
        name,
        searchText: name,
        level: 'Scratch 1',
        instructorId,
        startDate: new Date('2026-10-01T00:00:00.000Z'),
      },
    });
  }

  function slot(s: Setup, groupId: string, weekday: number, retired = false) {
    return prisma.unscoped.scheduleSlot.create({
      data: {
        academyId: s.academyId,
        groupId,
        weekday,
        startTime: new Date('1970-01-01T17:00:00.000Z'),
        durationMin: 60,
        ...(retired ? { retiredAt: new Date('2026-11-01T00:00:00.000Z') } : {}),
      },
    });
  }

  function session(
    s: Setup,
    groupId: string,
    when: string,
    status: 'scheduled' | 'held' | 'cancelled' = 'scheduled',
    instructorId = s.anaId,
  ) {
    return prisma.unscoped.session.create({
      data: {
        academyId: s.academyId,
        groupId,
        instructorId,
        scheduledAt: new Date(when),
        durationMin: 60,
        status,
        ...(status === 'cancelled' ? { cancelReason: 'test' } : {}),
      },
    });
  }

  async function newStudent(s: Setup, name: string) {
    count += 1;
    return prisma.unscoped.student.create({
      data: {
        academyId: s.academyId,
        code: `R-${count}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`,
        name,
        nameSearch: name,
        parentName: 'Parent',
        parentPhone: '+201000000000',
      },
    });
  }

  /** A student enrolled in the group through the API, which gives them a plan and a first cycle. */
  async function enrolled(
    s: Setup,
    groupId: string,
    name: string,
    plan: { sessionsPerCycle?: number; amount?: string; counted?: number } = {},
  ) {
    const student = await newStudent(s, name);
    await request(server())
      .post(api(`/groups/${groupId}/enrollments`))
      .set(as(s.adminToken))
      .send({
        studentId: student.id,
        startDate: '2026-10-01',
        plan: {
          sessionsPerCycle: plan.sessionsPerCycle ?? 4,
          amount: plan.amount ?? '900.00',
        },
      })
      .expect(201);
    const cycle = await prisma.unscoped.paymentCycle.findFirstOrThrow({
      where: { studentId: student.id, status: 'in_progress' },
    });
    if (plan.counted) {
      await prisma.unscoped.paymentCycle.update({
        where: { id: cycle.id },
        data: { sessionsCounted: plan.counted },
      });
    }
    return { student, cycleId: cycle.id };
  }

  /** A plan for an (instructor, group) pair through the API, which gives it a first cycle. */
  async function paired(
    s: Setup,
    groupId: string,
    instructorId: string,
    plan: { sessionsPerCycle?: number; amount?: string; counted?: number } = {},
  ) {
    await request(server())
      .post(api(`/instructors/${instructorId}/payment-plans`))
      .set(as(s.adminToken))
      .send({
        groupId,
        sessionsPerCycle: plan.sessionsPerCycle ?? 4,
        amount: plan.amount ?? '1500.00',
      })
      .expect(201);
    const cycle = await prisma.unscoped.paymentCycle.findFirstOrThrow({
      where: { instructorId, groupId, status: 'in_progress' },
    });
    if (plan.counted) {
      await prisma.unscoped.paymentCycle.update({
        where: { id: cycle.id },
        data: { sessionsCounted: plan.counted },
      });
    }
    return { cycleId: cycle.id };
  }

  async function makeDue(cycleId: string, dueAt: string) {
    const cycle = await prisma.unscoped.paymentCycle.findUniqueOrThrow({ where: { id: cycleId } });
    await prisma.unscoped.paymentCycle.update({
      where: { id: cycleId },
      data: { status: 'due', sessionsCounted: cycle.sessionsPerCycle, dueAt: new Date(dueAt) },
    });
  }

  /** Makes the cycle Due, then pays it through the API on a local day, with the plan amount. */
  async function pay(
    s: Setup,
    cycleId: string,
    paidOn: string,
    amount: string,
    method: 'cash' | 'transfer' | 'wallet' = 'cash',
  ) {
    await makeDue(cycleId, '2026-11-01T10:00:00.000Z');
    await request(server())
      .post(api(`/payment-cycles/${cycleId}/payments`))
      .set(as(s.adminToken))
      .send({ amount, paidOn, method })
      .expect(201);
  }

  const finance = (token: string, query: Record<string, string> = {}) =>
    request(server()).get(api('/reports/finance')).query(query).set(as(token));
  const report = async (token: string, from: string, to: string) =>
    (await finance(token, { from, to }).expect(200)).body as FinanceReport;
  const overview = async (token: string) =>
    (await request(server()).get(api('/reports/overview')).set(as(token)).expect(200))
      .body as OverviewReport;

  beforeAll(async () => {
    app = await createTestApp({ loginRateLimit: 1000, now: NOW });
    prisma = app.get(PrismaService);
  });

  afterAll(async () => {
    for (const id of academies) await removeAcademy(prisma, id);
    await app.close();
  });

  describe('access', () => {
    it('is for the admin: an instructor is 403 on every report, no login is 401', async () => {
      const s = await setup('access');
      await finance(s.adminToken).expect(200);
      await request(server()).get(api('/reports/overview')).set(as(s.adminToken)).expect(200);
      await finance(s.anaToken).expect(403);
      await request(server()).get(api('/reports/overview')).set(as(s.anaToken)).expect(403);
      await request(server()).get(api('/reports/finance')).expect(401);
      await request(server()).get(api('/reports/overview')).expect(401);
    });

    it("never counts another academy's rows", async () => {
      const mine = await setup('mine');
      const theirs = await setup('theirs');
      const g = await group(theirs, 'Theirs');
      await slot(theirs, g.id, 4);
      const { cycleId } = await enrolled(theirs, g.id, 'Theirs', { amount: '700.00' });
      await pay(theirs, cycleId, '2026-11-10', '700.00');
      const due = await enrolled(theirs, g.id, 'Theirs 2', { amount: '800.00' });
      await makeDue(due.cycleId, '2026-11-05T10:00:00.000Z');
      await paired(theirs, g.id, theirs.anaId, { amount: '1500.00' });

      const empty = await report(mine.adminToken, '2026-11-01', '2026-11-30');
      expect(empty).toEqual({
        period: { from: '2026-11-01', to: '2026-11-30' },
        actual: { in: '0.00', out: '0.00', net: '0.00' },
        expected: {
          in: '0.00',
          out: '0.00',
          net: '0.00',
          skippedStudents: 0,
          skippedInstructorPairs: 0,
        },
        outstanding: {
          students: { count: 0, total: '0.00' },
          instructors: { count: 0, total: '0.00' },
        },
      });
      expect(await overview(mine.adminToken)).toEqual({
        roundIncome: '0.00',
        roundOutflow: '0.00',
        roundNet: '0.00',
        averageRoundWeeks: null,
      });
      expect((await report(theirs.adminToken, '2026-11-01', '2026-11-30')).actual.in).toBe(
        '700.00',
      );
    });
  });

  describe('period', () => {
    it('defaults to the current local month and echoes the period', async () => {
      const s = await setup('default');
      const body = (await finance(s.adminToken).expect(200)).body as FinanceReport;
      expect(body.period).toEqual({ from: '2026-11-01', to: '2026-11-30' });
    });

    it('refuses a to before from (400), a malformed date (400) and more than 366 days (422)', async () => {
      const s = await setup('period');
      await finance(s.adminToken, { from: '2026-11-10', to: '2026-11-09' }).expect(400);
      await finance(s.adminToken, { from: '2026-11-1' }).expect(400);
      await finance(s.adminToken, { from: '2026-01-01', to: '2027-01-01' }).expect(200); // 366 days
      const tooLong = await finance(s.adminToken, { from: '2026-01-01', to: '2027-01-02' }).expect(
        422,
      );
      expect((tooLong.body as { code: string }).code).toBe('REPORT_PERIOD_TOO_LONG');
    });
  });

  describe('actual', () => {
    it('sums payments by paid_on, both edges of the period included and the days around left out', async () => {
      const s = await setup('actual');
      const g = await group(s, 'G');
      // Students: paid on 11-04 (out), 11-05 (in), 11-10 (in), 11-11 (out).
      for (const [day, amount] of [
        ['2026-11-04', '700.00'],
        ['2026-11-05', '900.00'],
        ['2026-11-10', '1000.25'],
        ['2026-11-11', '600.00'],
      ] as const) {
        const { cycleId } = await enrolled(s, g.id, `S ${day}`, { amount });
        await pay(s, cycleId, day, amount);
      }
      // Instructors: paid on 11-10 (in), 11-04 (out).
      const g2 = await group(s, 'G2', s.omarId);
      const first = await paired(s, g.id, s.anaId, { amount: '1500.00' });
      const second = await paired(s, g2.id, s.omarId, { amount: '1200.50' });
      await pay(s, first.cycleId, '2026-11-10', '1500.00', 'transfer');
      await pay(s, second.cycleId, '2026-11-04', '1200.50', 'wallet');

      const body = await report(s.adminToken, '2026-11-05', '2026-11-10');
      expect(body.actual).toEqual({ in: '1900.25', out: '1500.00', net: '400.25' });
    });

    it('is negative when more went out than came in, as a decimal string', async () => {
      const s = await setup('negative');
      const g = await group(s, 'G');
      const pair = await paired(s, g.id, s.anaId, { amount: '1500.00' });
      await pay(s, pair.cycleId, '2026-11-10', '1500.00');
      const body = await report(s.adminToken, '2026-11-01', '2026-11-30');
      expect(body.actual).toEqual({ in: '0.00', out: '1500.00', net: '-1500.00' });
    });
  });

  describe('expected', () => {
    it('counts a cycle that completes inside the period, not one that completes after it', async () => {
      const s = await setup('inside');
      const g = await group(s, 'G');
      await enrolled(s, g.id, 'A', { counted: 2 }); // needs two more sessions
      for (const day of ['2026-11-19', '2026-11-26', '2026-12-03']) await session(s, g.id, at(day));

      // The second session is on the 26th: the cycle completes that day.
      expect((await report(s.adminToken, '2026-11-01', '2026-11-30')).expected.in).toBe('900.00');
      expect((await report(s.adminToken, '2026-11-26', '2026-11-26')).expected.in).toBe('900.00');
      // A period that ends the day before sees it complete after the period.
      expect((await report(s.adminToken, '2026-11-01', '2026-11-25')).expected.in).toBe('0.00');
      // The next cycle needs four sessions and only one is left: still nothing more.
      expect((await report(s.adminToken, '2026-11-01', '2026-12-31')).expected.in).toBe('900.00');
    });

    it('does not count a Cancelled session toward completing a cycle', async () => {
      const s = await setup('cancelled');
      const g = await group(s, 'G');
      await enrolled(s, g.id, 'A', { counted: 2 });
      const cancelled = await session(s, g.id, at('2026-11-19'), 'cancelled');
      await session(s, g.id, at('2026-11-26'));
      await session(s, g.id, at('2026-12-03'));

      // Without the 19th the second session is on 12-03, after the period ends.
      expect((await report(s.adminToken, '2026-11-01', '2026-11-30')).expected.in).toBe('0.00');
      await prisma.unscoped.session.update({
        where: { id: cancelled.id },
        data: { status: 'scheduled', cancelReason: null },
      });
      expect((await report(s.adminToken, '2026-11-01', '2026-11-30')).expected.in).toBe('900.00');
    });

    it('counts two cycles in a long period, the second at the new plan (applied from the next cycle)', async () => {
      const s = await setup('plan-change');
      const g = await group(s, 'G');
      const { student } = await enrolled(s, g.id, 'A', { counted: 3 }); // needs one more
      // A new version: 2 sessions for 1200.00. It applies from the next cycle, not the open one.
      await request(server())
        .post(api(`/students/${student.id}/payment-plans`))
        .set(as(s.adminToken))
        .send({ sessionsPerCycle: 2, amount: '1200.00' })
        .expect(201);
      for (const day of ['2026-11-13', '2026-11-19', '2026-11-20', '2026-11-26', '2026-11-27']) {
        await session(s, g.id, at(day));
      }

      // 11-13 completes the open cycle (900), then 11-20 and 11-27 complete two of 1200 each.
      expect((await report(s.adminToken, '2026-11-01', '2026-11-30')).expected.in).toBe('3300.00');
      // A period that starts on the 14th does not count the cycle that completed on the 13th.
      expect((await report(s.adminToken, '2026-11-14', '2026-11-30')).expected.in).toBe('2400.00');
    });

    it('projects an instructor pair from the sessions of its group that the instructor teaches', async () => {
      const s = await setup('pair');
      const g = await group(s, 'G');
      await paired(s, g.id, s.anaId, { amount: '1500.00', counted: 2 });
      await session(s, g.id, at('2026-11-19'));
      await session(s, g.id, at('2026-11-20'), 'scheduled', s.omarId); // another instructor's
      await session(s, g.id, at('2026-11-26'));
      await session(s, g.id, at('2026-12-03'));

      const body = await report(s.adminToken, '2026-11-01', '2026-11-30');
      expect(body.expected).toMatchObject({ in: '0.00', out: '1500.00', net: '-1500.00' });
    });

    it('extends a group with its active slots past the generated sessions, and ignores a retired slot', async () => {
      const s = await setup('slots');
      const g = await group(s, 'G');
      const thursday = await slot(s, g.id, 4);
      await enrolled(s, g.id, 'A'); // needs four sessions, then four more
      // Generated through 2026-12-03 (Thursdays); the slot continues on 12-10, 12-17, 12-24, 12-31.
      for (const day of ['2026-11-12', '2026-11-19', '2026-11-26', '2026-12-03']) {
        await session(s, g.id, at(day));
      }

      // The open cycle completes on 12-03 and the next one on 12-31, both at 900.00.
      expect((await report(s.adminToken, '2026-12-01', '2026-12-31')).expected.in).toBe('1800.00');
      expect((await report(s.adminToken, '2026-12-25', '2026-12-31')).expected.in).toBe('900.00');

      await prisma.unscoped.scheduleSlot.update({
        where: { id: thursday.id },
        data: { retiredAt: new Date('2026-11-13T00:00:00.000Z') },
      });
      expect((await report(s.adminToken, '2026-12-25', '2026-12-31')).expected.in).toBe('0.00');
    });

    it('reads a period that has passed from the due_at of the cycles, at the local edges', async () => {
      const s = await setup('past');
      const g = await group(s, 'G');
      const inOctober = await enrolled(s, g.id, 'A', { amount: '900.00' });
      const lastSecond = await enrolled(s, g.id, 'B', { amount: '1000.00' });
      const inNovember = await enrolled(s, g.id, 'C', { amount: '1100.00' });
      await makeDue(inOctober.cycleId, '2026-10-10T10:00:00.000Z');
      await makeDue(lastSecond.cycleId, '2026-10-31T21:59:59.000Z'); // 23:59:59 on 10-31 in Cairo
      await makeDue(inNovember.cycleId, '2026-10-31T22:00:00.000Z'); // 00:00 on 11-01 in Cairo
      const pair = await paired(s, g.id, s.anaId, { amount: '1500.00' });
      await makeDue(pair.cycleId, '2026-10-12T10:00:00.000Z');

      const october = await report(s.adminToken, '2026-10-01', '2026-10-31');
      expect(october.expected).toMatchObject({ in: '1900.00', out: '1500.00', net: '400.00' });
      const november = await report(s.adminToken, '2026-11-01', '2026-11-30');
      expect(november.expected).toMatchObject({ in: '1100.00', out: '0.00' });
      // Due cycles are outstanding whatever the period.
      expect(november.outstanding.students).toEqual({ count: 3, total: '3000.00' });
    });

    it('skips and counts a student with no plan or no open enrollment, and a pair with no plan', async () => {
      const s = await setup('skipped');
      const g = await group(s, 'G');
      await group(s, 'No plan'); // its current instructor (ana) has no plan for it
      const noPlan = await newStudent(s, 'No plan');
      await prisma.unscoped.enrollment.create({
        data: {
          academyId: s.academyId,
          studentId: noPlan.id,
          groupId: g.id,
          startDate: new Date('2026-10-01'),
        },
      });
      const left = await enrolled(s, g.id, 'Left', { counted: 3 });
      await prisma.unscoped.enrollment.updateMany({
        where: { studentId: left.student.id },
        data: { endDate: new Date('2026-11-01') },
      });
      await enrolled(s, g.id, 'Fine', { counted: 3 });
      await paired(s, g.id, s.anaId, { counted: 3 });
      await session(s, g.id, at('2026-11-19'));

      const body = await report(s.adminToken, '2026-11-01', '2026-11-30');
      expect(body.expected.skippedStudents).toBe(2);
      expect(body.expected.skippedInstructorPairs).toBe(1);
      // The student who is fine and the pair are still projected.
      expect(body.expected).toMatchObject({ in: '900.00', out: '1500.00' });
    });
  });

  describe('outstanding', () => {
    it('counts and totals the Due cycles by payee type, whatever the period', async () => {
      const s = await setup('outstanding');
      const g = await group(s, 'G');
      const a = await enrolled(s, g.id, 'A', { amount: '900.00' });
      const b = await enrolled(s, g.id, 'B', { amount: '1000.50' });
      await enrolled(s, g.id, 'In progress', { amount: '5000.00' });
      const paid = await enrolled(s, g.id, 'Paid', { amount: '300.00' });
      await makeDue(a.cycleId, '2026-11-02T10:00:00.000Z');
      await makeDue(b.cycleId, '2026-09-02T10:00:00.000Z');
      await pay(s, paid.cycleId, '2026-11-10', '300.00');
      const pair = await paired(s, g.id, s.anaId, { amount: '1500.00' });
      await makeDue(pair.cycleId, '2026-10-02T10:00:00.000Z');

      for (const [from, to] of [
        ['2026-11-01', '2026-11-30'],
        ['2026-01-01', '2026-01-31'],
      ]) {
        const body = await report(s.adminToken, from, to);
        expect(body.outstanding).toEqual({
          students: { count: 2, total: '1900.50' },
          instructors: { count: 1, total: '1500.00' },
        });
      }
    });
  });

  describe('overview', () => {
    it('adds one cycle of every student with a plan and of every active pair, with the average round', async () => {
      const s = await setup('overview');
      const g = await group(s, 'G');
      await slot(s, g.id, 1);
      await slot(s, g.id, 4);
      await slot(s, g.id, 6, true); // retired: not a slot of the week
      await enrolled(s, g.id, 'A', { sessionsPerCycle: 8, amount: '900.00' }); // 8 / 2 = 4 weeks
      await enrolled(s, g.id, 'B', { sessionsPerCycle: 4, amount: '1000.00' }); // 4 / 2 = 2 weeks
      const noPlan = await newStudent(s, 'No plan');
      await prisma.unscoped.enrollment.create({
        data: {
          academyId: s.academyId,
          studentId: noPlan.id,
          groupId: g.id,
          startDate: new Date('2026-10-01'),
        },
      });
      await newStudent(s, 'Not enrolled');
      await paired(s, g.id, s.anaId, { amount: '1500.00' });
      // A former instructor of the group, and an inactive group, are not part of a round.
      const other = await group(s, 'Other', s.omarId);
      await paired(s, other.id, s.omarId, { amount: '700.00' });
      await prisma.unscoped.group.update({ where: { id: other.id }, data: { isActive: false } });

      expect(await overview(s.adminToken)).toEqual({
        roundIncome: '1900.00',
        roundOutflow: '1500.00',
        roundNet: '400.00',
        averageRoundWeeks: 3,
      });
    });

    it('rounds the average to one decimal and leaves out a group with no active slot', async () => {
      const s = await setup('average');
      const g = await group(s, 'G');
      await slot(s, g.id, 4);
      await slot(s, g.id, 5);
      await slot(s, g.id, 6);
      const noSlots = await group(s, 'No slots');
      await enrolled(s, g.id, 'A', { sessionsPerCycle: 8 }); // 8 / 3 = 2.666…
      await enrolled(s, noSlots.id, 'B', { sessionsPerCycle: 4 }); // no slot: not averaged
      const body = await overview(s.adminToken);
      expect(body.averageRoundWeeks).toBe(2.7);
      expect(body.roundIncome).toBe('1800.00'); // both students still count toward the round
    });
  });

  describe('GET /payments', () => {
    it('filters by method, and takes pageSize up to 100', async () => {
      const s = await setup('payments');
      const g = await group(s, 'G');
      const a = await enrolled(s, g.id, 'A', { amount: '900.00' });
      const b = await enrolled(s, g.id, 'B', { amount: '1000.00' });
      const c = await enrolled(s, g.id, 'C', { amount: '1100.00' });
      await pay(s, a.cycleId, '2026-11-10', '900.00', 'cash');
      await pay(s, b.cycleId, '2026-11-10', '1000.00', 'transfer');
      await pay(s, c.cycleId, '2026-11-10', '1100.00', 'transfer');

      const list = async (query: Record<string, string>) =>
        (
          await request(server())
            .get(api('/payments'))
            .query(query)
            .set(as(s.adminToken))
            .expect(200)
        ).body as Page<Payment>;
      const transfers = await list({ method: 'transfer', pageSize: '100' });
      expect(transfers.data.map((payment) => payment.method)).toEqual(['transfer', 'transfer']);
      expect(transfers.meta.pageSize).toBe(100);
      expect((await list({ method: 'cash' })).meta.total).toBe(1);
      expect((await list({ method: 'cash', payeeType: 'instructor' })).meta.total).toBe(0);
      await request(server())
        .get(api('/payments'))
        .query({ method: 'cheque' })
        .set(as(s.adminToken))
        .expect(400);
      await request(server())
        .get(api('/payments'))
        .query({ pageSize: '101' })
        .set(as(s.adminToken))
        .expect(400);
    });
  });

  describe('GET /reports/sessions', () => {
    const sessionsReport = (token: string, query: Record<string, string> = {}) =>
      request(server()).get(api('/reports/sessions')).query(query).set(as(token));

    it('is for the admin: an instructor is 403, no login is 401', async () => {
      const s = await setup('sessions-access');
      await sessionsReport(s.adminToken).expect(200);
      await sessionsReport(s.anaToken).expect(403);
      await request(server()).get(api('/reports/sessions')).expect(401);
    });

    it('defaults to the current local month, one bucket per day, and echoes the period', async () => {
      const s = await setup('sessions-default');
      const body = (await sessionsReport(s.adminToken).expect(200)).body as SessionsReport;
      expect(body.period).toEqual({ from: '2026-11-01', to: '2026-11-30' });
      expect(body.granularity).toBe('day');
      expect(body.buckets).toHaveLength(30);
      expect(body.kpis).toEqual({
        held: 0,
        cancelled: 0,
        unmarked: 0,
        upcoming: 0,
        attendanceRate: null,
        averageActualDurationMin: null,
      });
    });

    it('refuses a to before from (400) and more than 366 days (422)', async () => {
      const s = await setup('sessions-period');
      await sessionsReport(s.adminToken, { from: '2026-11-10', to: '2026-11-01' }).expect(400);
      const long = await sessionsReport(s.adminToken, {
        from: '2026-01-01',
        to: '2027-01-02',
      }).expect(422);
      expect((long.body as { code: string }).code).toBe('REPORT_PERIOD_TOO_LONG');
    });

    it("never counts another academy's sessions", async () => {
      const mine = await setup('sessions-mine');
      const theirs = await setup('sessions-theirs');
      const g = await group(theirs, 'Theirs');
      await session(theirs, g.id, at('2026-11-05'), 'held');
      await session(theirs, g.id, at('2026-11-06'), 'cancelled');
      const body = (await sessionsReport(mine.adminToken).expect(200)).body as SessionsReport;
      expect(body.kpis).toMatchObject({ held: 0, cancelled: 0, unmarked: 0, upcoming: 0 });
    });

    it('puts a session at 23:30 local on its local day, and 00:30 on the next', async () => {
      const s = await setup('sessions-midnight');
      const g = await group(s, 'Midnight');
      // Cairo is UTC+2 in November: 21:30Z is 23:30 on the 3rd, 22:30Z is 00:30 on the 4th.
      await session(s, g.id, '2026-11-03T21:30:00.000Z', 'held');
      await session(s, g.id, '2026-11-03T22:30:00.000Z', 'held');
      const body = (
        await sessionsReport(s.adminToken, { from: '2026-11-01', to: '2026-11-30' }).expect(200)
      ).body as SessionsReport;
      expect(body.buckets.find((b) => b.key === '2026-11-03')?.held).toBe(1);
      expect(body.buckets.find((b) => b.key === '2026-11-04')?.held).toBe(1);
    });

    it('counts held, cancelled, unmarked and upcoming sessions of the period only', async () => {
      const s = await setup('sessions-states');
      const g = await group(s, 'States');
      await session(s, g.id, at('2026-11-02'), 'held');
      await session(s, g.id, at('2026-11-03'), 'cancelled');
      await session(s, g.id, at('2026-11-04'), 'scheduled'); // past: unmarked
      await session(s, g.id, at('2026-11-20'), 'scheduled'); // ahead: upcoming
      await session(s, g.id, at('2026-10-31'), 'held'); // before the period
      await session(s, g.id, at('2026-12-01'), 'scheduled'); // after the period
      const body = (
        await sessionsReport(s.adminToken, { from: '2026-11-01', to: '2026-11-30' }).expect(200)
      ).body as SessionsReport;
      expect(body.kpis).toMatchObject({ held: 1, cancelled: 1, unmarked: 1, upcoming: 1 });
    });

    it('computes the attendance rate and the average real duration on known data', async () => {
      const s = await setup('sessions-kpis');
      const g = await group(s, 'Kpis');
      const first = await session(s, g.id, at('2026-11-02'), 'held');
      const second = await session(s, g.id, at('2026-11-03'), 'held');
      await prisma.unscoped.session.update({
        where: { id: first.id },
        data: {
          actualStartedAt: new Date('2026-11-02T15:00:00.000Z'),
          actualEndedAt: new Date('2026-11-02T16:00:00.000Z'), // 60 minutes
        },
      });
      await prisma.unscoped.session.update({
        where: { id: second.id },
        data: {
          actualStartedAt: new Date('2026-11-03T15:00:00.000Z'),
          actualEndedAt: new Date('2026-11-03T15:45:00.000Z'), // 45 minutes
        },
      });
      const marks = [
        [first.id, 'present'],
        [first.id, 'present'],
        [first.id, 'absent'],
        [second.id, 'present'],
      ] as const;
      for (const [sessionId, status] of marks) {
        const student = await newStudent(s, 'Kpi');
        await prisma.unscoped.attendance.create({
          data: {
            academyId: s.academyId,
            sessionId,
            studentId: student.id,
            status,
            recordedById: s.anaId,
            recordedAt: NOW,
          },
        });
      }
      const body = (
        await sessionsReport(s.adminToken, { from: '2026-11-01', to: '2026-11-30' }).expect(200)
      ).body as SessionsReport;
      expect(body.kpis.attendanceRate).toBe(75); // 3 present of 4 rows
      expect(body.kpis.averageActualDurationMin).toBe(53); // (60 + 45) / 2 = 52.5
    });

    it('is one bucket per month above 62 days, and per day at exactly 62', async () => {
      const s = await setup('sessions-granularity');
      const g = await group(s, 'Granularity');
      await session(s, g.id, at('2026-10-10'), 'held');
      await session(s, g.id, at('2026-11-10'), 'held');
      const months = (
        await sessionsReport(s.adminToken, { from: '2026-10-01', to: '2026-12-02' }).expect(200)
      ).body as SessionsReport;
      expect(months.granularity).toBe('month');
      expect(months.buckets.map((b) => [b.key, b.held])).toEqual([
        ['2026-10', 1],
        ['2026-11', 1],
        ['2026-12', 0],
      ]);
      const days = (
        await sessionsReport(s.adminToken, { from: '2026-10-01', to: '2026-12-01' }).expect(200)
      ).body as SessionsReport;
      expect(days.granularity).toBe('day');
      expect(days.buckets).toHaveLength(62);
    });
  });

  describe('GET /reports/instructors', () => {
    const instructorsReport = (token: string, query: Record<string, string> = {}) =>
      request(server()).get(api('/reports/instructors')).query(query).set(as(token));
    const rowsOf = async (token: string, from: string, to: string) =>
      (await instructorsReport(token, { from, to }).expect(200)).body as InstructorsReport;
    const rowOf = (body: InstructorsReport, id: string) =>
      body.rows.find((row) => row.instructorId === id);

    /** A held session, with real start and end times when `minutes` is given. */
    async function held(
      s: Setup,
      groupId: string,
      day: string,
      instructorId: string,
      minutes: number | null = null,
    ) {
      const created = await session(s, groupId, at(day), 'held', instructorId);
      if (minutes !== null) {
        await prisma.unscoped.session.update({
          where: { id: created.id },
          data: {
            actualStartedAt: new Date(at(day)),
            actualEndedAt: new Date(new Date(at(day)).getTime() + minutes * 60_000),
          },
        });
      }
      return created;
    }

    async function mark(s: Setup, sessionId: string, statuses: ('present' | 'absent')[]) {
      for (const status of statuses) {
        const student = await newStudent(s, 'Mark');
        await prisma.unscoped.attendance.create({
          data: {
            academyId: s.academyId,
            sessionId,
            studentId: student.id,
            status,
            recordedById: s.anaId,
            recordedAt: NOW,
          },
        });
      }
    }

    it('is for the admin: an instructor is 403, no login is 401', async () => {
      const s = await setup('instructors-access');
      await instructorsReport(s.adminToken).expect(200);
      await instructorsReport(s.anaToken).expect(403);
      await request(server()).get(api('/reports/instructors')).expect(401);
    });

    it('defaults to the current local month, echoes the period and lists the instructors, not the admin', async () => {
      const s = await setup('instructors-default');
      const body = (await instructorsReport(s.adminToken).expect(200)).body as InstructorsReport;
      expect(body.period).toEqual({ from: '2026-11-01', to: '2026-11-30' });
      expect(body.rows.map((row) => row.instructorId).sort()).toEqual([s.anaId, s.omarId].sort());
      expect(body.kpis).toEqual({
        activeInstructors: 2,
        held: 0,
        actualMinutes: 0,
        paid: '0.00',
        due: { count: 0, total: '0.00' },
        expectedOutflow: '0.00',
      });
    });

    it('refuses a to before from (400) and more than 366 days (422)', async () => {
      const s = await setup('instructors-period');
      await instructorsReport(s.adminToken, { from: '2026-11-10', to: '2026-11-01' }).expect(400);
      const long = await instructorsReport(s.adminToken, {
        from: '2026-01-01',
        to: '2027-01-02',
      }).expect(422);
      expect((long.body as { code: string }).code).toBe('REPORT_PERIOD_TOO_LONG');
    });

    it("never counts another academy's rows", async () => {
      const mine = await setup('instructors-mine');
      const theirs = await setup('instructors-theirs');
      const g = await group(theirs, 'Theirs');
      await held(theirs, g.id, '2026-11-05', theirs.anaId, 60);
      const pair = await paired(theirs, g.id, theirs.anaId, { amount: '700.00' });
      await pay(theirs, pair.cycleId, '2026-11-06', '700.00');

      const body = await rowsOf(mine.adminToken, '2026-11-01', '2026-11-30');
      expect(body.rows.map((row) => row.instructorId).sort()).toEqual(
        [mine.anaId, mine.omarId].sort(),
      );
      expect(body.kpis).toMatchObject({ held: 0, actualMinutes: 0, paid: '0.00' });
    });

    it('counts sessions by the instructor on the session, so a former instructor keeps what they taught', async () => {
      const s = await setup('instructors-sessions');
      // Omar teaches the group now; Ana held and cancelled sessions of it before the change.
      const g = await group(s, 'G', s.omarId);
      const first = await held(s, g.id, '2026-11-02', s.anaId, 60);
      await held(s, g.id, '2026-11-03', s.anaId); // no actual times
      await session(s, g.id, at('2026-11-04'), 'cancelled', s.anaId);
      await held(s, g.id, '2026-11-05', s.omarId, 30);
      await held(s, g.id, '2026-12-02', s.anaId, 60); // after the period
      await session(s, g.id, at('2026-11-06'), 'scheduled', s.anaId); // not held, not cancelled
      await mark(s, first.id, ['present', 'present', 'absent']);

      const body = await rowsOf(s.adminToken, '2026-11-01', '2026-11-30');
      expect(rowOf(body, s.anaId)).toMatchObject({
        activeGroups: 0,
        held: 2,
        cancelled: 1,
        actualMinutes: 60,
        heldWithoutActualTimes: 1,
        attendanceRate: 66.7,
      });
      expect(rowOf(body, s.omarId)).toMatchObject({
        activeGroups: 1,
        held: 1,
        cancelled: 0,
        actualMinutes: 30,
        heldWithoutActualTimes: 0,
        attendanceRate: null,
      });
      expect(body.kpis).toMatchObject({ held: 3, actualMinutes: 90 });
    });

    it('sums what was paid by paid_on, both edges of the period included', async () => {
      const s = await setup('instructors-paid');
      // A payment cannot be dated after today (the 12th), so the period ends in the past.
      const days = ['2026-10-19', '2026-10-20', '2026-11-10', '2026-11-11'];
      for (const [index, day] of days.entries()) {
        const g = await group(s, `G${index}`);
        const pair = await paired(s, g.id, s.anaId, { amount: '1000.00' });
        await pay(s, pair.cycleId, day, '1000.00');
      }
      const body = await rowsOf(s.adminToken, '2026-10-20', '2026-11-10');
      expect(rowOf(body, s.anaId)?.paid).toBe('2000.00'); // the 20th and the 10th, not the days around
      expect(rowOf(body, s.omarId)?.paid).toBe('0.00');
      expect(body.kpis.paid).toBe('2000.00');
    });

    it('counts the cycles due now whatever the period', async () => {
      const s = await setup('instructors-due');
      const october = await group(s, 'October');
      const december = await group(s, 'December');
      const oct = await paired(s, october.id, s.anaId, { amount: '1500.00' });
      const dec = await paired(s, december.id, s.anaId, { amount: '1200.00' });
      await makeDue(oct.cycleId, '2026-10-12T10:00:00.000Z');
      await makeDue(dec.cycleId, '2026-12-20T10:00:00.000Z');

      const body = await rowsOf(s.adminToken, '2026-11-01', '2026-11-30');
      expect(rowOf(body, s.anaId)?.due).toEqual({ count: 2, total: '2700.00' });
      expect(body.kpis.due).toEqual({ count: 2, total: '2700.00' });
    });

    it('expects, per instructor, what the finance report expects for instructors in total, a former instructor included', async () => {
      const s = await setup('instructors-expected');
      // Ana: two groups, each completing a cycle in November. Omar: one group completing a cycle,
      // and one cycle that already fell due on the 5th (the passed part of the period).
      const first = await group(s, 'First', s.anaId);
      const second = await group(s, 'Second', s.anaId);
      const third = await group(s, 'Third', s.omarId);
      const fourth = await group(s, 'Fourth', s.omarId);
      await paired(s, first.id, s.anaId, { amount: '1500.00', counted: 2 });
      await paired(s, second.id, s.anaId, { amount: '1200.00', counted: 2 });
      await paired(s, third.id, s.omarId, { amount: '800.00', counted: 2 });
      const passed = await paired(s, fourth.id, s.omarId, { amount: '1500.00' });
      await makeDue(passed.cycleId, '2026-11-05T10:00:00.000Z');
      for (const [g, instructorId] of [
        [first, s.anaId],
        [second, s.anaId],
        [third, s.omarId],
      ] as const) {
        await session(s, g.id, at('2026-11-19'), 'scheduled', instructorId);
        await session(s, g.id, at('2026-11-26'), 'scheduled', instructorId);
      }

      // Zed is a former instructor (inactive now) who is still owed money: a cycle that fell due on
      // the 6th, and a second group whose cycle completes in the period.
      const zedId = await createUser(prisma, s.academyId, {
        name: 'zed',
        email: mail('zed', 'instructors-expected'),
        password,
        role: SystemRole.Instructor,
      });
      const fifth = await group(s, 'Fifth', zedId);
      const sixth = await group(s, 'Sixth', zedId);
      const owed = await paired(s, fifth.id, zedId, { amount: '1100.00' });
      await makeDue(owed.cycleId, '2026-11-06T10:00:00.000Z');
      await paired(s, sixth.id, zedId, { amount: '700.00', counted: 2 });
      await session(s, sixth.id, at('2026-11-19'), 'scheduled', zedId);
      await session(s, sixth.id, at('2026-11-26'), 'scheduled', zedId);
      await prisma.unscoped.user.update({ where: { id: zedId }, data: { isActive: false } });

      const body = await rowsOf(s.adminToken, '2026-11-01', '2026-11-30');
      expect(rowOf(body, s.anaId)?.expected).toBe('2700.00');
      expect(rowOf(body, s.omarId)?.expected).toBe('2300.00');
      expect(rowOf(body, zedId)).toMatchObject({
        isActive: false,
        held: 0,
        expected: '1800.00',
        due: { count: 1, total: '1100.00' },
      });
      expect(body.kpis.expectedOutflow).toBe('6800.00');
      // The totals add up the rows, so they equal the finance report with no exception.
      const finance = await report(s.adminToken, '2026-11-01', '2026-11-30');
      expect(body.kpis.expectedOutflow).toBe(finance.expected.out);
      expect(body.kpis.due).toEqual(finance.outstanding.instructors);
    });

    it('lists an inactive instructor with nothing owed only when they held, cancelled or were paid in the period', async () => {
      const s = await setup('instructors-inactive');
      const zedId = await createUser(prisma, s.academyId, {
        name: 'zed',
        email: mail('zed', 'instructors-inactive'),
        password,
        role: SystemRole.Instructor,
        isActive: false,
      });
      const before = await rowsOf(s.adminToken, '2026-11-01', '2026-11-30');
      expect(rowOf(before, zedId)).toBeUndefined();

      const g = await group(s, 'G');
      await held(s, g.id, '2026-11-03', zedId, 45);
      const after = await rowsOf(s.adminToken, '2026-11-01', '2026-11-30');
      expect(rowOf(after, zedId)).toMatchObject({ isActive: false, held: 1, actualMinutes: 45 });
      expect(after.kpis.activeInstructors).toBe(2);
      // Another period has nothing of theirs.
      const december = await rowsOf(s.adminToken, '2026-12-01', '2026-12-31');
      expect(rowOf(december, zedId)).toBeUndefined();
    });
  });

  describe('the migration', () => {
    const migrationSql = () => {
      const dir = join(__dirname, '..', 'prisma', 'migrations');
      const folder = readdirSync(dir).find((name) => name.endsWith('_reports_read_permission'));
      if (!folder) throw new Error('the reports permission migration is missing');
      return readFileSync(join(dir, folder, 'migration.sql'), 'utf8');
    };
    /** The statements without their comments, one per entry. */
    const statements = (sql: string) =>
      sql
        .split('\n')
        .filter((line) => !line.trim().startsWith('--'))
        .join('\n')
        .split(';')
        .map((statement) => statement.trim())
        .filter((statement) => statement.length > 0);

    it('grants reports.read to the Admin role of an existing academy, and only to Admin', async () => {
      const s = await setup('migration');
      const grant = (roleName: string) =>
        prisma.unscoped.rolePermission.count({
          where: {
            role: { academyId: s.academyId, name: roleName },
            permission: { key: 'reports.read:any' },
          },
        });
      const permissions = () =>
        prisma.unscoped.permission.count({ where: { key: 'reports.read:any' } });

      // An academy that existed before the migration has no such grant.
      await prisma.unscoped.rolePermission.deleteMany({
        where: {
          role: { academyId: s.academyId, name: 'Admin' },
          permission: { key: 'reports.read:any' },
        },
      });
      expect(await grant('Admin')).toBe(0);

      for (const statement of statements(migrationSql()))
        await prisma.unscoped.$executeRawUnsafe(statement);
      expect(await grant('Admin')).toBe(1);
      expect(await grant('Instructor')).toBe(0);
      expect(await permissions()).toBe(1);

      // Running it again changes nothing.
      for (const statement of statements(migrationSql()))
        await prisma.unscoped.$executeRawUnsafe(statement);
      expect(await grant('Admin')).toBe(1);
      expect(await permissions()).toBe(1);
    });
  });
});
