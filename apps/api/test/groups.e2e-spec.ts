import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { SystemRole, type Group, type InstructorDetail, type Page } from '@kidzzy/shared';
import request from 'supertest';
import type { App } from 'supertest/types';
import { PrismaService } from '../src/modules/prisma/prisma.service';
import { createAcademy, createTestApp, createUser, readCookies, removeAcademy } from './helpers';

// US-07 (SCRUM-20): groups and their weekly schedule. AC: at least one slot, and the instructor
// is an active instructor. AC-08 (US-03): an instructor opening another instructor's group is
// denied (403); another academy's group is 404.

describe('Groups (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let academyId: string;
  let otherAcademyId: string;
  let adminId: string;
  let ana: string; // an active instructor
  let ben: string; // another active instructor
  let gone: string; // a deactivated instructor
  let otherInstructor: string; // an instructor of another academy
  let adminToken: string;
  let anaToken: string;
  let otherAdminToken: string;
  const password = 'correct-horse-1';
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  const mail = (name: string) => `${name}-${stamp}@test.local`;

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

  const slot = (weekday: number, startTime: string, durationMin = 60) => ({
    weekday,
    startTime,
    durationMin,
  });

  // Not async: it returns supertest's request, so a test can chain .expect(201).
  function createGroup(body: Record<string, unknown>, token = adminToken) {
    return request(server())
      .post(api('/groups'))
      .set(as(token))
      .send({
        name: 'جروب A',
        level: 'Scratch 1',
        instructorId: ana,
        startDate: '2026-11-01',
        schedule: [slot(6, '16:00'), slot(2, '16:00')],
        ...body,
      });
  }

  async function list(query: Record<string, string | number | boolean> = {}, token = adminToken) {
    const res = await request(server()).get(api('/groups')).query(query).set(as(token)).expect(200);
    return res.body as Page<Group>;
  }

  beforeAll(async () => {
    app = await createTestApp({ loginRateLimit: 1000 });
    prisma = app.get(PrismaService);
    academyId = await createAcademy(prisma, 'groups');
    otherAcademyId = await createAcademy(prisma, 'groups-other');
    const user = (name: string, role: SystemRole, isActive = true, aId = academyId) =>
      createUser(prisma, aId, { name, email: mail(name), password, role, isActive });
    adminId = await user('admin', SystemRole.Admin);
    ana = await user('ana', SystemRole.Instructor);
    ben = await user('ben', SystemRole.Instructor);
    gone = await user('gone', SystemRole.Instructor, false);
    await user('other-admin', SystemRole.Admin, true, otherAcademyId);
    otherInstructor = await user('other-instructor', SystemRole.Instructor, true, otherAcademyId);
    adminToken = await signIn(mail('admin'));
    anaToken = await signIn(mail('ana'));
    otherAdminToken = await signIn(mail('other-admin'));
  });

  afterAll(async () => {
    await removeAcademy(prisma, academyId);
    await removeAcademy(prisma, otherAcademyId);
    await app.close();
  });

  describe('create', () => {
    it('creates the group with its sorted schedule, the instructor and no students yet', async () => {
      const res = await createGroup({ name: '  جروب A  ' }).expect(201);
      expect(res.body).toEqual({
        id: expect.any(String) as string,
        name: 'جروب A',
        level: 'Scratch 1',
        instructor: { id: ana, name: 'ana' },
        startDate: '2026-11-01',
        isActive: true,
        // Sunday-first order: Tuesday (2) before Saturday (6)
        schedule: [slot(2, '16:00'), slot(6, '16:00')],
        studentCount: 0,
        heldCount: 0,
        nextSessionAt: null,
      });
      const row = await prisma.unscoped.group.findUniqueOrThrow({
        where: { id: (res.body as Group).id },
        include: { slots: true },
      });
      expect(row.academyId).toBe(academyId);
      expect(row.slots.every((s) => s.academyId === academyId)).toBe(true);
    });

    it('accepts back-to-back slots on one day and a slot ending at midnight', async () => {
      await createGroup({
        name: 'Back to back',
        schedule: [slot(1, '16:00', 60), slot(1, '17:00', 60), slot(5, '23:00', 60)],
      }).expect(201);
    });

    it.each([
      ['no schedule', { schedule: [] }],
      ['a start time of 24:00', { schedule: [slot(1, '24:00')] }],
      ['a start time of 99:99', { schedule: [slot(1, '99:99')] }],
      ['a duration of 10', { schedule: [slot(1, '16:00', 10)] }],
      ['a duration of 241', { schedule: [slot(1, '16:00', 241)] }],
      ['weekday 7', { schedule: [slot(7, '16:00')] }],
      [
        '15 slots',
        { schedule: Array.from({ length: 15 }, (_, i) => slot(i % 7, '0' + (i % 9) + ':00')) },
      ],
      ['a date that does not exist', { startDate: '2026-02-30' }],
      ['a date-time as the start date', { startDate: '2026-11-01T00:00:00Z' }],
      ['a blank name', { name: '   ' }],
      ['no level', { level: undefined }],
      ['an instructor id that is not a UUID', { instructorId: 'ana' }],
      ['an unknown field', { isActive: false }],
    ])('refuses %s (400)', async (_label, body) => {
      const res = await createGroup(body).expect(400);
      expect(res.body).toMatchObject({ code: 'VALIDATION_FAILED' });
    });

    it('refuses overlapping slots, and a slot ending after midnight (422 SCHEDULE_OVERLAP)', async () => {
      for (const schedule of [
        [slot(1, '16:00', 60), slot(1, '16:30', 60)],
        [slot(1, '16:00', 60), slot(1, '16:00', 60)],
        [slot(3, '23:30', 60)],
      ]) {
        const res = await createGroup({ schedule }).expect(422);
        expect(res.body).toMatchObject({ status: 422, code: 'SCHEDULE_OVERLAP' });
      }
    });

    it('AC: refuses an instructor who is not active, or not an instructor of the academy (422)', async () => {
      for (const instructorId of [gone, adminId, randomUUID(), otherInstructor]) {
        const res = await createGroup({ instructorId }).expect(422);
        expect(res.body).toMatchObject({ code: 'INSTRUCTOR_NOT_ASSIGNABLE' });
      }
    });

    it('creates nothing when the request is refused', async () => {
      const before = await prisma.unscoped.group.count({ where: { academyId } });
      await createGroup({ schedule: [slot(1, '16:00'), slot(1, '16:00')] }).expect(422);
      expect(await prisma.unscoped.group.count({ where: { academyId } })).toBe(before);
    });

    it('refuses an instructor creating a group (403)', async () => {
      const res = await createGroup({}, anaToken).expect(403);
      expect(res.body).toMatchObject({ code: 'FORBIDDEN' });
    });
  });

  describe('list and get', () => {
    let benGroup: string;
    let inactiveGroup: string;
    let otherAcademyGroup: string;

    beforeAll(async () => {
      benGroup = (
        (await createGroup({ name: 'مجموعة أحمد', instructorId: ben }).expect(201)).body as Group
      ).id;
      await createGroup({ name: '100% sure', level: 'Python', instructorId: ben }).expect(201);
      await createGroup({ name: 'under_score', level: 'Python', instructorId: ana }).expect(201);
      inactiveGroup = ((await createGroup({ name: 'متوقف' }).expect(201)).body as Group).id;
      // No endpoint to deactivate before SCRUM-26: set it directly.
      await prisma.unscoped.group.update({
        where: { id: inactiveGroup },
        data: { isActive: false },
      });
      otherAcademyGroup = (
        (
          await createGroup(
            { name: 'Other academy', instructorId: otherInstructor },
            otherAdminToken,
          ).expect(201)
        ).body as Group
      ).id;
    });

    it('lists the academy’s groups sorted by name, never another academy’s', async () => {
      const page = await list({ pageSize: 100 });
      expect(page.data.map((g) => g.id)).not.toContain(otherAcademyGroup);
      expect(page.meta).toEqual({ page: 1, pageSize: 100, total: page.data.length });
      const second = await list({ page: 2, pageSize: 2 });
      expect(second.data.map((g) => g.id)).toEqual(page.data.slice(2, 4).map((g) => g.id));
    });

    it('searches the name or the level, ignoring Arabic letter forms and case', async () => {
      const names = async (search: string) => (await list({ search })).data.map((g) => g.name);
      expect(await names('احمد')).toEqual(['مجموعة أحمد']);
      expect(await names('SURE')).toEqual(['100% sure']);
      expect((await names('python')).sort()).toEqual(['100% sure', 'under_score']);
      expect(await names('%')).toEqual(['100% sure']);
      expect(await names('_')).toEqual(['under_score']);
    });

    it('filters by isActive and by instructor', async () => {
      expect((await list({ isActive: false })).data.map((g) => g.id)).toEqual([inactiveGroup]);
      const bens = await list({ instructorId: ben, pageSize: 100 });
      expect(bens.data.length).toBe(2);
      expect(bens.data.every((g) => g.instructor.id === ben)).toBe(true);
    });

    it.each([[{ instructorId: 'nope' }], [{ isActive: 'yes' }], [{ pageSize: 101 }]])(
      'refuses the query %j (400)',
      async (query) => {
        await request(server()).get(api('/groups')).query(query).set(as(adminToken)).expect(400);
      },
    );

    it('scope own: an instructor lists only their own groups', async () => {
      const mine = await list({ pageSize: 100 }, anaToken);
      expect(mine.data.length).toBeGreaterThan(0);
      expect(mine.data.every((g) => g.instructor.id === ana)).toBe(true);
      // Asking for another instructor's groups finds none.
      expect(await list({ instructorId: ben }, anaToken)).toEqual({
        data: [],
        meta: { page: 1, pageSize: 20, total: 0 },
      });
    });

    it('gets one group; an instructor reads their own', async () => {
      const own = (await list({ instructorId: ana }, anaToken)).data[0];
      const res = await request(server())
        .get(api(`/groups/${own.id}`))
        .set(as(anaToken))
        .expect(200);
      expect(res.body).toMatchObject({ id: own.id, instructor: { id: ana } });
      await request(server())
        .get(api(`/groups/${benGroup}`))
        .set(as(adminToken))
        .expect(200);
    });

    it('AC-08: an instructor opening another instructor’s group gets 403 (not 404)', async () => {
      const res = await request(server())
        .get(api(`/groups/${benGroup}`))
        .set(as(anaToken))
        .expect(403);
      expect(res.body).toMatchObject({ status: 403, code: 'FORBIDDEN' });
    });

    it('answers 404 for another academy’s group, whoever asks, and for an unknown id', async () => {
      for (const token of [adminToken, anaToken]) {
        const res = await request(server())
          .get(api(`/groups/${otherAcademyGroup}`))
          .set(as(token))
          .expect(404);
        expect(res.body).toMatchObject({ code: 'NOT_FOUND' });
      }
      await request(server())
        .get(api(`/groups/${randomUUID()}`))
        .set(as(adminToken))
        .expect(404);
      await request(server()).get(api('/groups/42')).set(as(adminToken)).expect(400);
    });

    it('fills the groups of an instructor’s detail (the active ones, by name)', async () => {
      const res = await request(server())
        .get(api(`/instructors/${ben}`))
        .set(as(adminToken))
        .expect(200);
      expect((res.body as InstructorDetail).groups.map((g) => g.name)).toEqual([
        '100% sure',
        'مجموعة أحمد',
      ]);
    });
  });

  describe('database checks (they hold whoever writes the row)', () => {
    let groupId: string;
    beforeAll(async () => {
      groupId = (await prisma.unscoped.group.findFirstOrThrow({ where: { academyId } })).id;
    });

    const insertSlot = (weekday: number, startTime: string, durationMin: number) =>
      prisma.unscoped.$executeRaw`
        INSERT INTO schedule_slots (id, academy_id, group_id, weekday, start_time, duration_min, updated_at)
        VALUES (${randomUUID()}::uuid, ${academyId}::uuid, ${groupId}::uuid, ${weekday},
          ${startTime}::time, ${durationMin}, now())`;

    it.each([
      ['weekday 7', 7, '16:00', 60],
      ['a duration of 10', 1, '16:00', 10],
      ['a duration of 241', 1, '16:00', 241],
      ['a slot ending after midnight', 1, '23:30', 60],
    ])('refuses %s', async (_label, weekday, startTime, durationMin) => {
      await expect(insertSlot(weekday, startTime, durationMin)).rejects.toThrow();
    });

    it('accepts a slot in the stored form', async () => {
      await expect(insertSlot(0, '09:00', 90)).resolves.toBe(1);
    });

    it('refuses a blank name', async () => {
      await expect(
        prisma.unscoped.group.create({
          data: {
            academyId,
            name: '  ',
            level: 'x',
            searchText: 'x',
            instructorId: ana,
            startDate: new Date('2026-11-01'),
          },
        }),
      ).rejects.toThrow(/groups_names_not_blank_check/);
    });

    it('refuses an instructor of another academy (the composite foreign key)', async () => {
      await expect(
        prisma.unscoped.group.create({
          data: {
            academyId,
            name: 'Cross',
            level: 'x',
            searchText: 'cross x',
            instructorId: otherInstructor,
            startDate: new Date('2026-11-01'),
          },
        }),
      ).rejects.toThrow(/groups_instructor_id_academy_id_fkey/);
    });

    it('refuses a slot whose group is in another academy (the composite foreign key)', async () => {
      await expect(
        prisma.unscoped.$executeRaw`
          INSERT INTO schedule_slots (id, academy_id, group_id, weekday, start_time, duration_min, updated_at)
          VALUES (${randomUUID()}::uuid, ${otherAcademyId}::uuid, ${groupId}::uuid, 1, '10:00'::time, 60, now())`,
      ).rejects.toThrow(/schedule_slots_group_id_academy_id_fkey/);
    });
  });
});
