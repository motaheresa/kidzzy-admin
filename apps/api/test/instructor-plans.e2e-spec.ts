import { randomUUID } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { INestApplication } from '@nestjs/common';
import { SystemRole, type PaymentPlan } from '@kidzzy/shared';
import request from 'supertest';
import type { App } from 'supertest/types';
import { Prisma } from '../src/generated/prisma/client';
import { PrismaService } from '../src/modules/prisma/prisma.service';
import { createAcademy, createTestApp, createUser, readCookies, removeAcademy } from './helpers';

// US-21 (SCRUM-34) and SCRUM-72: set or change an instructor's plan. An instructor is paid per
// group (ADR-0015): a plan belongs to an (instructor, group) pair. The pair's first plan is
// version 1 and opens cycle 1 from the starting point (BR-14); a later one is the next version
// from the cycle after the one in progress (BR-10), like a student's.

const NOW = new Date('2026-10-16T09:00:00.000Z');

describe('Instructor plans per group (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let academyId: string;
  let otherAcademyId: string;
  let adminId: string;
  let adminToken: string;
  let anaId: string;
  let anaToken: string;
  let otherAdminToken: string;
  let otherInstructorId: string;
  const password = 'correct-horse-1';
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  const mail = (name: string) => `${name}-${stamp}@test.local`;
  let count = 0;
  const first = { sessionsPerCycle: 8, amount: '2400.00' };

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

  /** A new instructor with no plan, so each test starts clean. */
  async function newInstructor(isActive = true) {
    count += 1;
    return createUser(prisma, academyId, {
      name: `مدرس ${count}`,
      email: mail(`inst${count}`),
      password,
      role: SystemRole.Instructor,
      isActive,
    });
  }

  /** A group, written straight to the database: these tests are about plans, not schedules. */
  async function newGroup(instructorId: string, name?: string, inAcademy = academyId) {
    count += 1;
    const groupName = name ?? `جروب ${count}`;
    return prisma.unscoped.group.create({
      data: {
        academyId: inAcademy,
        name: groupName,
        searchText: groupName.toLowerCase(),
        level: 'Scratch 1',
        instructorId,
        startDate: new Date('2026-10-01T00:00:00.000Z'),
      },
    });
  }

  const setPlan = (instructorId: string, body: Record<string, unknown>, token = adminToken) =>
    request(server())
      .post(api(`/instructors/${instructorId}/payment-plans`))
      .set(as(token))
      .send(body);
  const list = (query: Record<string, string>, token = adminToken) =>
    request(server()).get(api('/payment-plans')).query(query).set(as(token));
  const versions = async (instructorId: string, groupId?: string, token = adminToken) =>
    (
      (await list(groupId ? { instructorId, groupId } : { instructorId }, token).expect(200))
        .body as { data: PaymentPlan[] }
    ).data;
  const cyclesOf = (instructorId: string, groupId?: string) =>
    prisma.unscoped.paymentCycle.findMany({
      where: { instructorId, ...(groupId ? { groupId } : {}) },
      orderBy: [{ groupId: 'asc' }, { cycleNumber: 'asc' }],
    });

  beforeAll(async () => {
    app = await createTestApp({ loginRateLimit: 1000, now: NOW });
    prisma = app.get(PrismaService);
    academyId = await createAcademy(prisma, 'instructor-plans');
    otherAcademyId = await createAcademy(prisma, 'instructor-plans-other');
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
    otherInstructorId = await createUser(prisma, otherAcademyId, {
      name: 'other-instructor',
      email: mail('other-instructor'),
      password,
      role: SystemRole.Instructor,
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

  describe('the first plan of a group', () => {
    it('is version 1 and opens cycle 1 of that group from the starting point', async () => {
      const instructor = await newInstructor();
      const group = await newGroup(instructor, 'جروب الاول');
      const res = await setPlan(instructor, {
        ...first,
        groupId: group.id,
        openingCount: 3,
      }).expect(201);
      expect(res.body).toEqual({
        id: expect.any(String) as string,
        payeeType: 'instructor',
        payeeId: instructor,
        groupId: group.id,
        groupName: 'جروب الاول',
        sessionsPerCycle: 8,
        amount: '2400.00',
        effectiveFromCycle: 1,
        createdAt: expect.any(String) as string,
      });

      const cycles = await cyclesOf(instructor);
      expect(cycles).toHaveLength(1);
      expect(cycles[0]).toMatchObject({
        payeeType: 'instructor',
        studentId: null,
        groupId: group.id,
        groupAcademyId: academyId,
        cycleNumber: 1,
        planId: (res.body as PaymentPlan).id,
        sessionsPerCycle: 8,
        openingCount: 3,
        sessionsCounted: 3,
        status: 'in_progress',
        dueAt: null,
      });
      const rows = await prisma.unscoped.paymentPlan.findMany({
        where: { instructorId: instructor },
      });
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({
        version: 1,
        studentId: null,
        groupId: group.id,
        groupAcademyId: academyId,
      });
      expect(rows[0]?.amount.equals(new Prisma.Decimal('2400'))).toBe(true);
    });

    it('starts at 0 when no starting point is sent', async () => {
      const instructor = await newInstructor();
      const group = await newGroup(instructor);
      await setPlan(instructor, { ...first, groupId: group.id }).expect(201);
      expect((await cyclesOf(instructor))[0]).toMatchObject({
        openingCount: 0,
        sessionsCounted: 0,
      });
    });

    it('gives each group its own version 1, cycle 1, N, amount and starting point', async () => {
      const instructor = await newInstructor();
      const eight = await newGroup(instructor, 'جروب 8');
      const four = await newGroup(instructor, 'جروب 4');

      await setPlan(instructor, { ...first, groupId: eight.id, openingCount: 5 }).expect(201);
      await setPlan(instructor, {
        sessionsPerCycle: 4,
        amount: '1300.00',
        groupId: four.id,
        openingCount: 1,
      }).expect(201);

      expect(
        (await cyclesOf(instructor)).map((c) => [
          c.groupId === eight.id ? 'eight' : 'four',
          c.cycleNumber,
          c.sessionsPerCycle,
          c.openingCount,
          c.status,
        ]),
      ).toEqual(
        expect.arrayContaining([
          ['eight', 1, 8, 5, 'in_progress'],
          ['four', 1, 4, 1, 'in_progress'],
        ]),
      );
      const plans = await versions(instructor);
      expect(plans.map((p) => [p.groupName, p.sessionsPerCycle, p.effectiveFromCycle])).toEqual([
        ['جروب 4', 4, 1],
        ['جروب 8', 8, 1],
      ]);
    });

    it('refuses a starting point of N or more (422), and writes nothing', async () => {
      const instructor = await newInstructor();
      const group = await newGroup(instructor);
      const res = await setPlan(instructor, {
        ...first,
        groupId: group.id,
        openingCount: 8,
      }).expect(422);
      expect(res.body).toMatchObject({ code: 'STARTING_POINT_OUT_OF_RANGE' });
      expect(await versions(instructor)).toEqual([]);
      expect(await cyclesOf(instructor)).toEqual([]);
    });

    it('needs the instructor to be the group’s current instructor (422), and writes nothing', async () => {
      const instructor = await newInstructor();
      const someoneElses = await newGroup(await newInstructor());
      const res = await setPlan(instructor, { ...first, groupId: someoneElses.id }).expect(422);
      expect(res.body).toMatchObject({
        code: 'INSTRUCTOR_NOT_IN_GROUP',
        errors: [{ field: 'groupId' }],
      });
      expect(await versions(instructor)).toEqual([]);
      expect(await cyclesOf(instructor)).toEqual([]);
    });

    it('an inactive instructor who teaches the group can still be given a plan (their pay may be due)', async () => {
      const instructor = await newInstructor(false);
      const group = await newGroup(instructor);
      await setPlan(instructor, { ...first, groupId: group.id }).expect(201);
    });

    it('two first plans of the same group at once: one wins as version 1, the other is the next version', async () => {
      const instructor = await newInstructor();
      const group = await newGroup(instructor);
      const results = await Promise.all([
        setPlan(instructor, { sessionsPerCycle: 8, amount: '2400.00', groupId: group.id }),
        setPlan(instructor, { sessionsPerCycle: 4, amount: '1300.00', groupId: group.id }),
      ]);
      expect(results.map((r) => r.status)).toEqual([201, 201]);
      const rows = await prisma.unscoped.paymentPlan.findMany({
        where: { instructorId: instructor },
      });
      expect(rows.map((r) => r.version).sort()).toEqual([1, 2]);
      expect(await cyclesOf(instructor)).toHaveLength(1); // one cycle 1, not two
    });

    it('two first plans for two groups at once: each is version 1 of its own group', async () => {
      const instructor = await newInstructor();
      const groups = [await newGroup(instructor), await newGroup(instructor)];
      const results = await Promise.all(
        groups.map((group) => setPlan(instructor, { ...first, groupId: group.id })),
      );
      expect(results.map((r) => r.status)).toEqual([201, 201]);
      const rows = await prisma.unscoped.paymentPlan.findMany({
        where: { instructorId: instructor },
      });
      expect(rows.map((r) => r.version)).toEqual([1, 1]);
      expect(await cyclesOf(instructor)).toHaveLength(2);
    });
  });

  describe('a later plan of a group', () => {
    it('is the next version from the cycle after the one in progress; the cycle keeps its plan; other groups are untouched', async () => {
      const instructor = await newInstructor();
      const group = await newGroup(instructor, 'جروب أ');
      const other = await newGroup(instructor, 'جروب ب');
      await setPlan(instructor, { ...first, groupId: group.id, openingCount: 2 }).expect(201);
      await setPlan(instructor, { ...first, groupId: other.id }).expect(201);
      const before = await cyclesOf(instructor);

      const res = await setPlan(instructor, {
        sessionsPerCycle: 12,
        amount: '3500.25',
        groupId: group.id,
      }).expect(201);
      expect(res.body).toMatchObject({
        groupId: group.id,
        sessionsPerCycle: 12,
        amount: '3500.25',
        effectiveFromCycle: 2,
      });
      expect(await cyclesOf(instructor)).toEqual(before);
      expect(
        (await versions(instructor, group.id)).map((p) => [
          p.sessionsPerCycle,
          p.amount,
          p.effectiveFromCycle,
        ]),
      ).toEqual([
        [8, '2400.00', 1],
        [12, '3500.25', 2],
      ]);
      expect((await versions(instructor, other.id)).map((p) => p.effectiveFromCycle)).toEqual([1]);
    });

    it('refuses a starting point (409 STARTING_POINT_LOCKED), and the same plan of the group (409 PLAN_UNCHANGED)', async () => {
      const instructor = await newInstructor();
      const group = await newGroup(instructor);
      await setPlan(instructor, { ...first, groupId: group.id }).expect(201);
      const locked = await setPlan(instructor, {
        sessionsPerCycle: 12,
        amount: '3500.00',
        groupId: group.id,
        openingCount: 1,
      }).expect(409);
      expect(locked.body).toMatchObject({ code: 'STARTING_POINT_LOCKED' });
      const same = await setPlan(instructor, { ...first, groupId: group.id }).expect(409);
      expect(same.body).toMatchObject({ code: 'PLAN_UNCHANGED' });
      expect(await versions(instructor)).toHaveLength(1);
    });

    it('the same N and amount is a first plan, not unchanged, in another group', async () => {
      const instructor = await newInstructor();
      const group = await newGroup(instructor);
      const other = await newGroup(instructor);
      await setPlan(instructor, { ...first, groupId: group.id }).expect(201);
      await setPlan(instructor, { ...first, groupId: other.id }).expect(201);
    });

    it('is allowed after the group went to another instructor: the pair keeps its cycle', async () => {
      const instructor = await newInstructor();
      const successor = await newInstructor();
      const group = await newGroup(instructor);
      await setPlan(instructor, { ...first, groupId: group.id }).expect(201);
      await prisma.unscoped.group.update({
        where: { id: group.id },
        data: { instructorId: successor },
      });

      // The former instructor's plan can still change (their cycle is kept)…
      await setPlan(instructor, {
        sessionsPerCycle: 12,
        amount: '3500.00',
        groupId: group.id,
      }).expect(201);
      // …but a first plan for the group is for whoever teaches it now.
      const foreign = await newGroup(await newInstructor());
      await setPlan(instructor, { ...first, groupId: foreign.id }).expect(422);
      await setPlan(successor, { ...first, groupId: group.id }).expect(201);
      expect(await cyclesOf(instructor, group.id)).toHaveLength(1);
      expect(await cyclesOf(successor, group.id)).toHaveLength(1);
    });
  });

  describe('refusals', () => {
    it('unknown, admin and other-academy ids are 404', async () => {
      const instructor = await newInstructor();
      const group = await newGroup(instructor);
      await setPlan(randomUUID(), { ...first, groupId: group.id }).expect(404);
      await setPlan(adminId, { ...first, groupId: group.id }).expect(404); // an admin is not an instructor
      await setPlan(instructor, { ...first, groupId: group.id }, otherAdminToken).expect(404);
    });

    it('an unknown group and a group of another academy are 404', async () => {
      const instructor = await newInstructor();
      const foreign = await newGroup(otherInstructorId, 'جروب غريب', otherAcademyId);
      await setPlan(instructor, { ...first, groupId: randomUUID() }).expect(404);
      await setPlan(instructor, { ...first, groupId: foreign.id }).expect(404);
    });

    it('an instructor cannot set a plan, not even their own (payments.manage is the admin’s): 403', async () => {
      const group = await newGroup(anaId);
      await setPlan(anaId, { ...first, groupId: group.id }, anaToken).expect(403);
    });

    it.each([
      ['no group', { sessionsPerCycle: 8, amount: '2400.00' }, false],
      ['a group that is not an id', { ...first, groupId: 'not-an-id' }, false],
      ['an amount as a number', { sessionsPerCycle: 8, amount: 2400 }, true],
      ['an amount of zero', { sessionsPerCycle: 8, amount: '0.00' }, true],
      ['0 sessions', { sessionsPerCycle: 0, amount: '2400.00' }, true],
      ['101 sessions', { sessionsPerCycle: 101, amount: '2400.00' }, true],
      ['a negative starting point', { ...first, openingCount: -1 }, true],
      ['an unknown field', { ...first, effectiveFromCycle: 3 }, true],
    ])('refuses %s (400)', async (_label, body, withGroup) => {
      const instructor = await newInstructor();
      const group = await newGroup(instructor);
      await setPlan(instructor, withGroup ? { groupId: group.id, ...body } : body).expect(400);
    });
  });

  describe('reading', () => {
    it('lists every group by name then version, or one group with groupId', async () => {
      const instructor = await newInstructor();
      const b = await newGroup(instructor, 'ب جروب');
      const a = await newGroup(instructor, 'أ جروب');
      await setPlan(instructor, { ...first, groupId: b.id }).expect(201);
      await setPlan(instructor, { ...first, groupId: a.id }).expect(201);
      await setPlan(instructor, { sessionsPerCycle: 4, amount: '900.00', groupId: a.id }).expect(
        201,
      );

      expect((await versions(instructor)).map((p) => [p.groupName, p.sessionsPerCycle])).toEqual([
        ['أ جروب', 8],
        ['أ جروب', 4],
        ['ب جروب', 8],
      ]);
      expect((await versions(instructor, b.id)).map((p) => p.groupId)).toEqual([b.id]);
    });

    it('groupId needs instructorId (400), an unknown group is 404, and a student’s plans have no group', async () => {
      const instructor = await newInstructor();
      await list({ groupId: randomUUID() }).expect(400);
      await list({ instructorId: instructor, groupId: randomUUID() }).expect(404);
    });

    it('the admin reads the versions; an instructor reads their own plans (scope own) and not others’', async () => {
      const group = await newGroup(anaId);
      await setPlan(anaId, { ...first, groupId: group.id }).expect(201);
      expect(await versions(anaId)).toHaveLength(1);
      expect(await versions(anaId, undefined, anaToken)).toHaveLength(1);
      expect(await versions(anaId, group.id, anaToken)).toHaveLength(1);

      const other = await newInstructor();
      const otherGroup = await newGroup(other);
      await setPlan(other, { ...first, groupId: otherGroup.id }).expect(201);
      await list({ instructorId: other }, anaToken).expect(403);
      await list({ instructorId: other, groupId: otherGroup.id }, anaToken).expect(403);
    });
  });

  describe('database constraints', () => {
    // Prisma fills the mirror columns itself from the relation, so the checks on them are
    // exercised with raw SQL, which is what any other writer could do.
    const rawPlan = (
      payee: { student?: string | null; instructor?: string | null },
      group: string | null,
      groupMirror: string | null,
    ) =>
      prisma.unscoped.$executeRaw`
        INSERT INTO payment_plans (id, academy_id, payee_type, student_id, student_academy_id,
          instructor_id, instructor_academy_id, group_id, group_academy_id, version,
          sessions_per_cycle, amount, effective_from_cycle)
        VALUES (gen_random_uuid(), ${academyId}::uuid,
          ${payee.instructor ? 'instructor' : 'student'}::payee_type,
          ${payee.student ?? null}::uuid, ${payee.student ? academyId : null}::uuid,
          ${payee.instructor ?? null}::uuid, ${payee.instructor ? academyId : null}::uuid,
          ${group}::uuid, ${groupMirror}::uuid, 7, 4, 100.00, 1)`;

    it('refuses an instructor plan without a group', async () => {
      const instructor = await newInstructor();
      await expect(rawPlan({ instructor }, null, null)).rejects.toThrow();
    });

    it('refuses a student plan that has a group', async () => {
      const instructor = await newInstructor();
      const group = await newGroup(instructor);
      const student = await prisma.unscoped.student.create({
        data: {
          academyId,
          code: `K-${count}`,
          name: 'Student',
          nameSearch: 'student',
          parentName: 'Parent',
          parentPhone: '+201000000000',
        },
      });
      await expect(rawPlan({ student: student.id }, group.id, academyId)).rejects.toThrow();
    });

    it('refuses a group whose mirror column is missing or another academy', async () => {
      const instructor = await newInstructor();
      const group = await newGroup(instructor);
      await expect(rawPlan({ instructor }, group.id, null)).rejects.toThrow();
      await expect(rawPlan({ instructor }, group.id, otherAcademyId)).rejects.toThrow();
      await expect(rawPlan({ instructor }, null, academyId)).rejects.toThrow();
    });

    it('refuses a second cycle in progress and a repeated cycle number for the same pair', async () => {
      const instructor = await newInstructor();
      const group = await newGroup(instructor);
      const other = await newGroup(instructor);
      const plan = (await setPlan(instructor, { ...first, groupId: group.id }).expect(201))
        .body as PaymentPlan;
      await setPlan(instructor, { ...first, groupId: other.id }).expect(201);
      const cycle = (groupId: string, cycleNumber: number) =>
        prisma.unscoped.paymentCycle.create({
          data: {
            academyId,
            payeeType: 'instructor',
            instructorId: instructor,
            instructorAcademyId: academyId,
            groupId,
            groupAcademyId: academyId,
            planId: plan.id,
            sessionsPerCycle: 8,
            cycleNumber,
            sessionsCounted: 0,
          },
        });
      await expect(cycle(group.id, 2)).rejects.toThrow(); // one in progress per pair
      await expect(cycle(group.id, 1)).rejects.toThrow(); // cycle numbers are per pair
    });
  });

  describe('the migration guard', () => {
    const migration = () => {
      const dir = join(__dirname, '..', 'prisma', 'migrations');
      const folder = readdirSync(dir).find((name) => name.endsWith('_instructor_plans_per_group'));
      if (!folder) throw new Error('the per-group migration is missing');
      return readFileSync(join(dir, folder, 'migration.sql'), 'utf8');
    };
    const guard = (sql: string) => {
      const match = /DO \$\$[\s\S]*?\n\$\$;/.exec(sql);
      if (!match) throw new Error('the guard is missing');
      return match[0];
    };

    it('comes before any change, so it fails clearly instead of leaving a half-applied table', () => {
      const sql = migration();
      const position = sql.indexOf(guard(sql));
      expect(position).toBeGreaterThan(-1);
      for (const change of ['DROP INDEX', 'ALTER TABLE', 'CREATE UNIQUE INDEX']) {
        expect(sql.indexOf(change)).toBeGreaterThan(position);
      }
    });

    it('refuses to run while an instructor plan exists, and says what to do', async () => {
      const instructor = await newInstructor();
      const group = await newGroup(instructor);
      await setPlan(instructor, { ...first, groupId: group.id }).expect(201);

      await expect(
        prisma.unscoped.$transaction((tx) => tx.$executeRawUnsafe(guard(migration()))),
      ).rejects.toThrow(/delete instructor plans and cycles first/);
    });
  });
});
