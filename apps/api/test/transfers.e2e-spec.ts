import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { SystemRole, type Enrollment, type Group, type Student } from '@kidzzy/shared';
import request from 'supertest';
import type { App } from 'supertest/types';
import { PrismaService } from '../src/modules/prisma/prisma.service';
import { createAcademy, createTestApp, createUser, readCookies, removeAcademy } from './helpers';

// US-09 (SCRUM-25): transfer a student between groups. BR-11: the cycle and the plan stay with the
// student. With effectiveDate D, the old enrollment ends on D - 1 and the new one starts on D.
// AC-04: the cycle in progress is untouched (the full "2 of 4 -> 3 of 4" is re-tested in US-22).

const NOW = new Date('2026-10-16T09:00:00.000Z');

describe('Transfers (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let academyId: string;
  let otherAcademyId: string;
  let adminToken: string;
  let anaToken: string;
  let benToken: string;
  let otherAdminToken: string;
  let groupA: Group;
  let groupB: Group;
  let groupC: Group;
  const password = 'correct-horse-1';
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  const mail = (name: string) => `${name}-${stamp}@test.local`;
  let codes = 0;

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

  async function newGroup(instructorId: string) {
    const res = await request(server())
      .post(api('/groups'))
      .set(as(adminToken))
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

  /** A student enrolled in `group` from `startDate` with a 4-session plan. */
  async function enrolledStudent(group: Group, startDate = '2026-10-10', token = adminToken) {
    codes += 1;
    const created = await request(server())
      .post(api('/students'))
      .set(as(token))
      .send({
        code: `T-${codes}`,
        name: `طالب ${codes}`,
        parentName: 'ولي',
        parentPhone: '01012345678',
      })
      .expect(201);
    const student = created.body as Student;
    await request(server())
      .post(api(`/groups/${group.id}/enrollments`))
      .set(as(token))
      .send({ studentId: student.id, startDate, plan: { sessionsPerCycle: 4, amount: '1500.00' } })
      .expect(201);
    return student;
  }

  const transfer = (studentId: string, body: Record<string, unknown>, token = adminToken) =>
    request(server())
      .post(api(`/students/${studentId}/transfer`))
      .set(as(token))
      .send(body);
  const history = (studentId: string, token = adminToken) =>
    request(server())
      .get(api(`/students/${studentId}/enrollments`))
      .set(as(token));
  const day = (date: Date | null | undefined) => date?.toISOString().slice(0, 10) ?? null;
  const rows = (studentId: string) =>
    prisma.unscoped.enrollment.findMany({ where: { studentId }, orderBy: { startDate: 'asc' } });

  beforeAll(async () => {
    app = await createTestApp({ loginRateLimit: 1000, now: NOW });
    prisma = app.get(PrismaService);
    academyId = await createAcademy(prisma, 'transfers');
    otherAcademyId = await createAcademy(prisma, 'transfers-other');
    const user = (name: string, role: SystemRole, aId = academyId) =>
      createUser(prisma, aId, { name, email: mail(name), password, role });
    await user('admin', SystemRole.Admin);
    const ana = await user('ana', SystemRole.Instructor);
    const ben = await user('ben', SystemRole.Instructor);
    await user('other-admin', SystemRole.Admin, otherAcademyId);
    adminToken = await signIn(mail('admin'));
    anaToken = await signIn(mail('ana'));
    benToken = await signIn(mail('ben'));
    otherAdminToken = await signIn(mail('other-admin'));
    groupA = await newGroup(ana);
    groupB = await newGroup(ben);
    groupC = await newGroup(ben);
  });

  afterAll(async () => {
    await removeAcademy(prisma, academyId);
    await removeAcademy(prisma, otherAcademyId);
    await app.close();
  });

  describe('moving a student', () => {
    it('ends the old enrollment the day before and opens the new one on the day', async () => {
      const student = await enrolledStudent(groupA);
      const res = await transfer(student.id, {
        toGroupId: groupB.id,
        effectiveDate: '2026-10-20',
      }).expect(200);
      expect(res.body).toEqual({
        id: expect.any(String) as string,
        studentId: student.id,
        studentName: student.name,
        group: { id: groupB.id, name: groupB.name },
        startDate: '2026-10-20',
        endDate: null,
      });

      const [old, current] = await rows(student.id);
      expect([day(old.startDate), day(old.endDate), old.groupId]).toEqual([
        '2026-10-10',
        '2026-10-19',
        groupA.id,
      ]);
      expect([day(current.startDate), day(current.endDate), current.groupId]).toEqual([
        '2026-10-20',
        null,
        groupB.id,
      ]);
      // A day never belongs to two enrollments.
      expect(day(old.endDate)! < day(current.startDate)!).toBe(true);

      const shown = await request(server())
        .get(api(`/students/${student.id}`))
        .set(as(adminToken))
        .expect(200);
      expect((shown.body as Student).currentGroup).toEqual({ id: groupB.id, name: groupB.name });
      // The groups' student lists follow.
      for (const [group, count] of [
        [groupA, 0],
        [groupB, 1],
      ] as const) {
        const list = await request(server())
          .get(api(`/groups/${group.id}/enrollments`))
          .set(as(adminToken))
          .expect(200);
        const ids = (list.body as { data: Enrollment[] }).data.map((e) => e.studentId);
        expect(ids.filter((id) => id === student.id)).toHaveLength(count);
      }
    });

    it('AC-04: the cycle in progress and the plan are untouched', async () => {
      const student = await enrolledStudent(groupA);
      // Two of four sessions counted: set directly, as counting arrives with US-22.
      await prisma.unscoped.paymentCycle.updateMany({
        where: { studentId: student.id },
        data: { sessionsCounted: 2 },
      });
      const before = {
        cycles: await prisma.unscoped.paymentCycle.findMany({ where: { studentId: student.id } }),
        plans: await prisma.unscoped.paymentPlan.findMany({ where: { studentId: student.id } }),
      };

      await transfer(student.id, { toGroupId: groupB.id, effectiveDate: '2026-10-20' }).expect(200);

      const after = {
        cycles: await prisma.unscoped.paymentCycle.findMany({ where: { studentId: student.id } }),
        plans: await prisma.unscoped.paymentPlan.findMany({ where: { studentId: student.id } }),
      };
      expect(after).toEqual(before); // same ids, same counter, same plan, no new rows
      expect(after.cycles).toHaveLength(1);
      expect(after.cycles[0]).toMatchObject({ sessionsCounted: 2, status: 'in_progress' });
      const shown = await request(server())
        .get(api(`/students/${student.id}`))
        .set(as(adminToken))
        .expect(200);
      expect((shown.body as Student).currentCycle).toMatchObject({
        id: before.cycles[0].id,
        sessionsCounted: 2,
        sessionsPerCycle: 4,
        amount: '1500.00',
      });
    });

    it('on the day the student joined, the old enrollment covers no day', async () => {
      const student = await enrolledStudent(groupA, '2026-10-12');
      await transfer(student.id, { toGroupId: groupB.id, effectiveDate: '2026-10-12' }).expect(200);
      const [old, current] = await rows(student.id);
      expect(day(old.endDate)).toBe('2026-10-11');
      expect(day(current.startDate)).toBe('2026-10-12');
    });

    it('two transfers to the same group at once: one wins, the other is SAME_GROUP', async () => {
      const student = await enrolledStudent(groupA);
      const results = await Promise.all([
        transfer(student.id, { toGroupId: groupB.id, effectiveDate: '2026-10-20' }),
        transfer(student.id, { toGroupId: groupB.id, effectiveDate: '2026-10-20' }),
      ]);
      expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
      expect(results.find((r) => r.status === 409)?.body).toMatchObject({ code: 'SAME_GROUP' });
      expect(await rows(student.id)).toHaveLength(2);
    });
  });

  describe('refusals', () => {
    it.each([
      ['the group the student is in', 'SAME_GROUP', 409],
      ['an inactive group', 'GROUP_INACTIVE', 409],
    ])('refuses %s (%s)', async (label, code, status) => {
      const student = await enrolledStudent(groupA);
      let toGroupId = groupA.id;
      if (code === 'GROUP_INACTIVE') {
        const inactive = await newGroup(groupA.instructor.id);
        await request(server())
          .patch(api(`/groups/${inactive.id}`))
          .set(as(adminToken))
          .send({ isActive: false })
          .expect(200);
        toGroupId = inactive.id;
      }
      const res = await transfer(student.id, { toGroupId, effectiveDate: '2026-10-20' });
      expect(res.status).toBe(status);
      expect(res.body).toMatchObject({ code });
      expect(await rows(student.id)).toHaveLength(1);
      expect(day((await rows(student.id))[0].endDate)).toBeNull();
    });

    it('a student in no group is 409 NO_ACTIVE_ENROLLMENT', async () => {
      const student = await enrolledStudent(groupA);
      await request(server())
        .post(api(`/students/${student.id}/deactivate`))
        .set(as(adminToken))
        .expect(200);
      const res = await transfer(student.id, {
        toGroupId: groupB.id,
        effectiveDate: '2026-10-20',
      }).expect(409);
      expect(res.body).toMatchObject({ code: 'NO_ACTIVE_ENROLLMENT' });
    });

    it('a date before the student joined the current group is 422, and nothing changes', async () => {
      const student = await enrolledStudent(groupA, '2026-10-10');
      const res = await transfer(student.id, {
        toGroupId: groupB.id,
        effectiveDate: '2026-10-09',
      }).expect(422);
      expect(res.body).toMatchObject({ code: 'ENROLLMENT_DATE_INVALID' });
      expect(await rows(student.id)).toHaveLength(1);
    });

    it('unknown and other-academy student or group are 404', async () => {
      const student = await enrolledStudent(groupA);
      const body = { toGroupId: groupB.id, effectiveDate: '2026-10-20' };
      await transfer(randomUUID(), body).expect(404);
      await transfer(student.id, { ...body, toGroupId: randomUUID() }).expect(404);
      await transfer(student.id, body, otherAdminToken).expect(404);
    });

    it('an instructor cannot transfer (enrollments.manage is the admin’s): 403', async () => {
      const student = await enrolledStudent(groupA);
      await transfer(
        student.id,
        { toGroupId: groupB.id, effectiveDate: '2026-10-20' },
        anaToken,
      ).expect(403);
    });

    it.each([
      ['a toGroupId that is not a UUID', { toGroupId: 'B', effectiveDate: '2026-10-20' }],
      ['no date', { toGroupId: randomUUID() }],
      ['a date that does not exist', { toGroupId: randomUUID(), effectiveDate: '2026-02-30' }],
      ['an unknown field', { toGroupId: randomUUID(), effectiveDate: '2026-10-20', plan: {} }],
    ])('refuses %s (400)', async (_label, body) => {
      const student = await enrolledStudent(groupA);
      await transfer(student.id, body).expect(400);
    });
  });

  describe('group history', () => {
    it('lists every enrollment, the latest first', async () => {
      const student = await enrolledStudent(groupA, '2026-10-01');
      await transfer(student.id, { toGroupId: groupB.id, effectiveDate: '2026-10-10' }).expect(200);
      await transfer(student.id, { toGroupId: groupC.id, effectiveDate: '2026-10-15' }).expect(200);
      const res = await history(student.id).expect(200);
      const data = (res.body as { data: Enrollment[] }).data;
      expect(data.map((e) => [e.group.id, e.startDate, e.endDate])).toEqual([
        [groupC.id, '2026-10-15', null],
        [groupB.id, '2026-10-10', '2026-10-14'],
        [groupA.id, '2026-10-01', '2026-10-09'],
      ]);
      expect(data[0]).toMatchObject({ studentId: student.id, studentName: student.name });
    });

    it('scope own: the instructor of the current group reads it, another gets 403', async () => {
      const student = await enrolledStudent(groupA);
      await history(student.id, anaToken).expect(200);
      await history(student.id, benToken).expect(403);
      await history(randomUUID()).expect(404);
      await history(student.id, otherAdminToken).expect(404);
    });
  });
});
