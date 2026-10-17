import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { SystemRole, type Enrollment, type Group, type Page, type Student } from '@kidzzy/shared';
import request from 'supertest';
import type { App } from 'supertest/types';
import { Prisma } from '../src/generated/prisma/client';
import { PrismaService } from '../src/modules/prisma/prisma.service';
import { createAcademy, createTestApp, createUser, readCookies, removeAcademy } from './helpers';

// US-08 (SCRUM-21) and the student part of US-36: enroll a student in a group with a payment plan
// and a starting point. AC: a plan is required; a student with an active enrollment cannot join a
// second group (the database refuses it too). "Now" is fixed: 2026-10-16 12:00 in Cairo.

const NOW = new Date('2026-10-16T09:00:00.000Z');

describe('Enrollments (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let academyId: string;
  let otherAcademyId: string;
  let ana: string;
  let adminToken: string;
  let anaToken: string;
  let benToken: string;
  let otherAdminToken: string;
  let anaGroup: Group;
  let benGroup: Group;
  const password = 'correct-horse-1';
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  const mail = (name: string) => `${name}-${stamp}@test.local`;
  let codes = 0;

  const server = () => app.getHttpServer();
  const as = (token: string) => ({ Cookie: `access_token=${token}` });
  const api = (path: string) => `/api/v1${path}`;
  const plan = { sessionsPerCycle: 4, amount: '1500.00' };

  async function signIn(email: string) {
    const res = await request(server())
      .post(api('/auth/login'))
      .send({ login: email, password })
      .expect(200);
    return readCookies(res.headers['set-cookie']).access_token.value;
  }

  async function newGroup(instructorId: string, token = adminToken) {
    const res = await request(server())
      .post(api('/groups'))
      .set(as(token))
      .send({
        name: `Group ${Math.random().toString(36).slice(2, 7)}`,
        level: 'Scratch 1',
        instructorId,
        startDate: '2026-10-01',
        schedule: [{ weekday: 4, startTime: '17:00', durationMin: 60 }],
      })
      .expect(201);
    return res.body as Group;
  }

  async function newStudent(token = adminToken) {
    codes += 1;
    const res = await request(server())
      .post(api('/students'))
      .set(as(token))
      .send({
        code: `E-${codes}`,
        name: `طالب ${codes}`,
        parentName: 'ولي',
        parentPhone: '01012345678',
      })
      .expect(201);
    return res.body as Student;
  }

  const enroll = (groupId: string, body: Record<string, unknown>, token = adminToken) =>
    request(server())
      .post(api(`/groups/${groupId}/enrollments`))
      .set(as(token))
      .send({ startDate: '2026-10-10', plan, ...body });

  const getStudent = async (id: string, token = adminToken) =>
    (
      await request(server())
        .get(api(`/students/${id}`))
        .set(as(token))
        .expect(200)
    ).body as Student;

  const plansOf = (studentId: string) =>
    prisma.unscoped.paymentPlan.findMany({ where: { studentId }, orderBy: { version: 'asc' } });
  const cyclesOf = (studentId: string) =>
    prisma.unscoped.paymentCycle.findMany({
      where: { studentId },
      orderBy: { cycleNumber: 'asc' },
    });
  const day = (date: Date | null | undefined) => date?.toISOString().slice(0, 10) ?? null;

  beforeAll(async () => {
    app = await createTestApp({ loginRateLimit: 1000, now: NOW });
    prisma = app.get(PrismaService);
    academyId = await createAcademy(prisma, 'enrollments');
    otherAcademyId = await createAcademy(prisma, 'enrollments-other');
    const user = (name: string, role: SystemRole, aId = academyId) =>
      createUser(prisma, aId, { name, email: mail(name), password, role });
    await user('admin', SystemRole.Admin);
    ana = await user('ana', SystemRole.Instructor);
    const ben = await user('ben', SystemRole.Instructor);
    await user('other-admin', SystemRole.Admin, otherAcademyId);
    adminToken = await signIn(mail('admin'));
    anaToken = await signIn(mail('ana'));
    benToken = await signIn(mail('ben'));
    otherAdminToken = await signIn(mail('other-admin'));
    anaGroup = await newGroup(ana);
    benGroup = await newGroup(ben);
  });

  afterAll(async () => {
    await removeAcademy(prisma, academyId);
    await removeAcademy(prisma, otherAcademyId);
    await app.close();
  });

  describe('a first enrollment', () => {
    it('opens the enrollment, plan version 1 and cycle 1 from the starting point', async () => {
      const student = await newStudent();
      const res = await enroll(anaGroup.id, { studentId: student.id, openingCount: 2 }).expect(201);
      expect(res.body).toEqual({
        id: expect.any(String) as string,
        studentId: student.id,
        studentName: student.name,
        group: { id: anaGroup.id, name: anaGroup.name },
        startDate: '2026-10-10',
        endDate: null,
      });

      const plans = await plansOf(student.id);
      expect(plans).toHaveLength(1);
      expect(plans[0]).toMatchObject({
        payeeType: 'student',
        version: 1,
        sessionsPerCycle: 4,
        effectiveFromCycle: 1,
      });
      // Money stays a Decimal: compared as a Decimal, never as a JS number.
      expect(plans[0].amount.equals(new Prisma.Decimal('1500.00'))).toBe(true);

      const cycles = await cyclesOf(student.id);
      expect(cycles).toHaveLength(1);
      expect(cycles[0]).toMatchObject({
        cycleNumber: 1,
        planId: plans[0].id,
        openingCount: 2,
        sessionsCounted: 2,
        status: 'in_progress',
        dueAt: null,
      });

      // US-05 TODOs closed: the profile shows the group and the cycle, money as a string.
      const shown = await getStudent(student.id);
      expect(shown.currentGroup).toEqual({ id: anaGroup.id, name: anaGroup.name });
      expect(shown.currentCycle).toEqual({
        id: cycles[0].id,
        payeeType: 'student',
        payeeId: student.id,
        payeeName: student.name,
        cycleNumber: 1,
        sessionsPerCycle: 4,
        amount: '1500.00',
        openingCount: 2,
        sessionsCounted: 2,
        status: 'in_progress',
        dueAt: null,
        paidAt: null,
      });
    });

    it('starts at 0 when no starting point is sent', async () => {
      const student = await newStudent();
      await enroll(anaGroup.id, { studentId: student.id }).expect(201);
      expect((await cyclesOf(student.id))[0]).toMatchObject({
        openingCount: 0,
        sessionsCounted: 0,
      });
    });

    it('refuses a starting point of N or more (422), and writes nothing', async () => {
      const student = await newStudent();
      const res = await enroll(anaGroup.id, { studentId: student.id, openingCount: 4 }).expect(422);
      expect(res.body).toMatchObject({ code: 'STARTING_POINT_OUT_OF_RANGE' });
      expect(await plansOf(student.id)).toEqual([]);
      expect(await cyclesOf(student.id)).toEqual([]);
      expect(await getStudent(student.id)).toMatchObject({
        currentGroup: null,
        currentCycle: null,
      });
    });

    it.each([
      ['no plan (AC: a plan is required)', { plan: undefined }],
      ['an amount as a number', { plan: { sessionsPerCycle: 4, amount: 1500 } }],
      ['an amount of zero', { plan: { sessionsPerCycle: 4, amount: '0.00' } }],
      ['no start date', { startDate: undefined }],
      ['an unknown field', { groupId: randomUUID() }],
    ])('refuses %s (400)', async (_label, body) => {
      const student = await newStudent();
      await enroll(anaGroup.id, { studentId: student.id, ...body }).expect(400);
    });
  });

  describe('refusals', () => {
    it('AC: a student in a group cannot join a second one (409)', async () => {
      const student = await newStudent();
      await enroll(anaGroup.id, { studentId: student.id }).expect(201);
      const res = await enroll(benGroup.id, { studentId: student.id }).expect(409);
      expect(res.body).toMatchObject({ code: 'STUDENT_ALREADY_ENROLLED' });
      expect((await getStudent(student.id)).currentGroup?.id).toBe(anaGroup.id);
    });

    it('two enrollments of the same student at once: one wins, the other is 409', async () => {
      const student = await newStudent();
      const results = await Promise.all([
        enroll(anaGroup.id, { studentId: student.id }),
        enroll(benGroup.id, { studentId: student.id }),
      ]);
      expect(results.map((r) => r.status).sort()).toEqual([201, 409]);
      expect(await plansOf(student.id)).toHaveLength(1);
      expect(await cyclesOf(student.id)).toHaveLength(1);
    });

    it('the database refuses a second open enrollment, whoever writes it', async () => {
      const student = await newStudent();
      await enroll(anaGroup.id, { studentId: student.id }).expect(201);
      await expect(
        prisma.unscoped.enrollment.create({
          data: { academyId, studentId: student.id, groupId: benGroup.id, startDate: NOW },
        }),
      ).rejects.toThrow();
    });

    it('an inactive group is 409 GROUP_INACTIVE', async () => {
      const group = await newGroup(ana);
      await request(server())
        .patch(api(`/groups/${group.id}`))
        .set(as(adminToken))
        .send({ isActive: false })
        .expect(200);
      const student = await newStudent();
      const res = await enroll(group.id, { studentId: student.id }).expect(409);
      expect(res.body).toMatchObject({ code: 'GROUP_INACTIVE' });
    });

    it('an inactive, unknown or other-academy student is 422 STUDENT_NOT_ENROLLABLE', async () => {
      const inactive = await newStudent();
      await request(server())
        .post(api(`/students/${inactive.id}/deactivate`))
        .set(as(adminToken))
        .expect(200);
      const foreign = await newStudent(otherAdminToken);
      for (const studentId of [inactive.id, randomUUID(), foreign.id]) {
        const res = await enroll(anaGroup.id, { studentId }).expect(422);
        expect(res.body).toMatchObject({ code: 'STUDENT_NOT_ENROLLABLE' });
      }
    });

    it('an unknown or other-academy group is 404', async () => {
      const student = await newStudent();
      await enroll(randomUUID(), { studentId: student.id }).expect(404);
      await enroll(anaGroup.id, { studentId: student.id }, otherAdminToken).expect(404);
    });

    it('an instructor cannot enroll (enrollments.manage is the admin’s): 403', async () => {
      const student = await newStudent();
      await enroll(anaGroup.id, { studentId: student.id }, anaToken).expect(403);
    });
  });

  describe('leaving and coming back', () => {
    it('deactivation ends the enrollment yesterday; the cycle and the plan stay', async () => {
      const student = await newStudent();
      await enroll(anaGroup.id, { studentId: student.id, openingCount: 1 }).expect(201);
      const res = await request(server())
        .post(api(`/students/${student.id}/deactivate`))
        .set(as(adminToken))
        .expect(200);
      expect(res.body).toMatchObject({ isActive: false, currentGroup: null });
      expect((res.body as Student).currentCycle).toMatchObject({
        cycleNumber: 1,
        sessionsCounted: 1,
      });
      const [ended] = await prisma.unscoped.enrollment.findMany({
        where: { studentId: student.id },
      });
      expect(day(ended.endDate)).toBe('2026-10-15');
    });

    it('an enrollment that starts later ends the day before it starts (covers no day)', async () => {
      const student = await newStudent();
      await enroll(anaGroup.id, { studentId: student.id, startDate: '2026-11-01' }).expect(201);
      await request(server())
        .post(api(`/students/${student.id}/deactivate`))
        .set(as(adminToken))
        .expect(200);
      const [ended] = await prisma.unscoped.enrollment.findMany({
        where: { studentId: student.id },
      });
      expect(day(ended.endDate)).toBe('2026-10-31');
    });

    it('coming back keeps the open cycle; a new plan is the next version, from the next cycle', async () => {
      const student = await newStudent();
      await enroll(anaGroup.id, { studentId: student.id, openingCount: 3 }).expect(201);
      await request(server())
        .post(api(`/students/${student.id}/deactivate`))
        .set(as(adminToken))
        .expect(200);
      // There is no endpoint to reactivate a student yet (US-05): set it directly.
      await prisma.unscoped.student.update({ where: { id: student.id }, data: { isActive: true } });
      const [cycleBefore] = await cyclesOf(student.id);

      // A day never belongs to two enrollments: the old one ended on Oct 15.
      const early = await enroll(benGroup.id, { studentId: student.id, startDate: '2026-10-15' });
      expect(early.status).toBe(422);
      expect(early.body).toMatchObject({ code: 'ENROLLMENT_DATE_INVALID' });
      // The starting point only applies to a first cycle.
      const locked = await enroll(benGroup.id, {
        studentId: student.id,
        startDate: '2026-10-16',
        openingCount: 1,
      });
      expect(locked.status).toBe(409);
      expect(locked.body).toMatchObject({ code: 'STARTING_POINT_LOCKED' });

      await enroll(benGroup.id, {
        studentId: student.id,
        startDate: '2026-10-16',
        plan: { sessionsPerCycle: 8, amount: '2800.00' },
      }).expect(201);

      const cycles = await cyclesOf(student.id);
      expect(cycles).toHaveLength(1);
      expect(cycles[0]).toMatchObject({
        id: cycleBefore.id,
        planId: cycleBefore.planId,
        sessionsPerCycle: 4,
        sessionsCounted: 3,
        status: 'in_progress',
      });
      const plans = await plansOf(student.id);
      expect(plans.map((p) => [p.version, p.sessionsPerCycle, p.effectiveFromCycle])).toEqual([
        [1, 4, 1],
        [2, 8, 2],
      ]);
      expect(plans[1].amount.equals(new Prisma.Decimal('2800'))).toBe(true);
      const shown = await getStudent(student.id);
      expect(shown.currentGroup?.id).toBe(benGroup.id);
      expect(shown.currentCycle).toMatchObject({ id: cycleBefore.id, amount: '1500.00' });
    });

    it('coming back with the same plan adds no version', async () => {
      const student = await newStudent();
      await enroll(anaGroup.id, { studentId: student.id }).expect(201);
      await request(server())
        .post(api(`/students/${student.id}/deactivate`))
        .set(as(adminToken))
        .expect(200);
      await prisma.unscoped.student.update({ where: { id: student.id }, data: { isActive: true } });
      await enroll(anaGroup.id, { studentId: student.id, startDate: '2026-10-20' }).expect(201);
      expect(await plansOf(student.id)).toHaveLength(1);
      expect(await cyclesOf(student.id)).toHaveLength(1);
    });
  });

  describe('reading', () => {
    let group: Group;
    let mine: Student;
    let theirs: Student;
    let loose: Student;

    beforeAll(async () => {
      group = await newGroup(ana);
      mine = await newStudent();
      theirs = await newStudent();
      loose = await newStudent();
      await enroll(group.id, { studentId: mine.id }).expect(201);
      await enroll(benGroup.id, { studentId: theirs.id }).expect(201);
    });

    it('lists the group’s current students, and counts them on the group', async () => {
      const res = await request(server())
        .get(api(`/groups/${group.id}/enrollments`))
        .set(as(adminToken))
        .expect(200);
      const data = (res.body as { data: Enrollment[] }).data;
      expect(data.map((e) => e.studentId)).toEqual([mine.id]);
      const shown = await request(server())
        .get(api(`/groups/${group.id}`))
        .set(as(adminToken))
        .expect(200);
      expect((shown.body as Group).studentCount).toBe(1);
    });

    it('scope own: the group’s instructor reads its students, another instructor gets 403', async () => {
      await request(server())
        .get(api(`/groups/${group.id}/enrollments`))
        .set(as(anaToken))
        .expect(200);
      await request(server())
        .get(api(`/groups/${group.id}/enrollments`))
        .set(as(benToken))
        .expect(403);
      await request(server())
        .get(api(`/groups/${randomUUID()}/enrollments`))
        .set(as(adminToken))
        .expect(404);
    });

    it('GET /students?groupId= lists the students enrolled in that group now', async () => {
      const res = await request(server())
        .get(api('/students'))
        .query({ groupId: group.id })
        .set(as(adminToken))
        .expect(200);
      expect((res.body as Page<Student>).data.map((s) => s.id)).toEqual([mine.id]);
    });

    it('scope own: an instructor lists and reads only the students of their groups (403 otherwise)', async () => {
      const res = await request(server()).get(api('/students')).set(as(anaToken)).expect(200);
      const ids = (res.body as Page<Student>).data.map((s) => s.id);
      expect(ids).toContain(mine.id);
      expect(ids).not.toContain(theirs.id);
      expect(ids).not.toContain(loose.id);
      await getStudent(mine.id, anaToken);
      for (const id of [theirs.id, loose.id]) {
        await request(server())
          .get(api(`/students/${id}`))
          .set(as(anaToken))
          .expect(403);
      }
      // Another instructor's group as a filter finds nobody.
      const other = await request(server())
        .get(api('/students'))
        .query({ groupId: benGroup.id })
        .set(as(anaToken))
        .expect(200);
      expect((other.body as Page<Student>).data).toEqual([]);
    });
  });

  describe('database constraints', () => {
    let studentId: string;
    let planId: string;

    beforeAll(async () => {
      const student = await newStudent();
      studentId = student.id;
      await enroll(benGroup.id, { studentId }).expect(201);
      planId = (await plansOf(studentId))[0].id;
    });

    const planRow = (data: Record<string, unknown>) =>
      prisma.unscoped.paymentPlan.create({
        data: {
          academyId,
          payeeType: 'student',
          studentId,
          studentAcademyId: academyId,
          version: 9,
          sessionsPerCycle: 4,
          amount: new Prisma.Decimal('100.00'),
          effectiveFromCycle: 3,
          ...data,
        },
      });
    const cycleRow = (data: Record<string, unknown>) =>
      prisma.unscoped.paymentCycle.create({
        data: {
          academyId,
          payeeType: 'student',
          studentId,
          studentAcademyId: academyId,
          planId,
          sessionsPerCycle: 4,
          cycleNumber: 5,
          sessionsCounted: 4,
          status: 'due',
          dueAt: NOW,
          ...data,
        },
      });

    it.each([
      ['an amount of zero', { amount: new Prisma.Decimal('0') }],
      ['a negative amount', { amount: new Prisma.Decimal('-5.00') }],
      ['a payee that does not match payee_type', { payeeType: 'instructor' }],
      ['version 1 from a later cycle', { version: 1, effectiveFromCycle: 2 }],
      ['0 sessions per cycle', { sessionsPerCycle: 0 }],
    ])('refuses a plan with %s', async (_label, data) => {
      await expect(planRow(data)).rejects.toThrow();
    });

    // Prisma fills the mirror columns itself from the relation, so the two checks on them are
    // exercised with raw SQL, which is what any other writer could do.
    const rawPlan = (mirror: string, instructor: string | null, instructorMirror: string | null) =>
      prisma.unscoped.$executeRaw`
        INSERT INTO payment_plans (id, academy_id, payee_type, student_id, student_academy_id,
          instructor_id, instructor_academy_id, version, sessions_per_cycle, amount,
          effective_from_cycle)
        VALUES (gen_random_uuid(), ${academyId}::uuid, 'student', ${studentId}::uuid,
          ${mirror}::uuid, ${instructor}::uuid, ${instructorMirror}::uuid, 8, 4, 100.00, 3)`;

    it('refuses a plan for both a student and an instructor', async () => {
      await expect(rawPlan(academyId, ana, academyId)).rejects.toThrow();
    });

    it('refuses a plan whose mirror column is another academy', async () => {
      await expect(rawPlan(otherAcademyId, null, null)).rejects.toThrow();
    });

    it.each([
      ['a second cycle in progress', { status: 'in_progress', dueAt: null, sessionsCounted: 0 }],
      ['a starting point on a cycle other than the first', { openingCount: 1, sessionsCounted: 4 }],
      ['a starting point of N', { cycleNumber: 1, openingCount: 4, sessionsCounted: 4 }],
      ['a count above N', { sessionsCounted: 5 }],
      ['an N that is not the plan’s', { sessionsPerCycle: 8, sessionsCounted: 8 }],
      ['a due cycle with fewer than N sessions', { sessionsCounted: 3 }],
      ['a paid cycle without paid_at', { status: 'paid', sessionsCounted: 4 }],
      ['an existing cycle number', { cycleNumber: 1, sessionsCounted: 4 }],
    ])('refuses a cycle with %s', async (_label, data) => {
      await expect(cycleRow(data)).rejects.toThrow();
    });

    it('accepts a well-formed plan and due cycle (the checks do not refuse everything)', async () => {
      await expect(planRow({})).resolves.toMatchObject({ version: 9 });
      await expect(cycleRow({})).resolves.toMatchObject({ status: 'due' });
    });
  });
});
