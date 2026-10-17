import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { SystemRole, type Page, type Student } from '@kidzzy/shared';
import request from 'supertest';
import type { App } from 'supertest/types';
import { PrismaService } from '../src/modules/prisma/prisma.service';
import { createAcademy, createTestApp, createUser, readCookies, removeAcademy } from './helpers';

// US-05 (SCRUM-18): student records. AC: a code already used in the academy is rejected.

describe('Students (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let academyId: string;
  let otherAcademyId: string;
  let adminToken: string;
  let instructorToken: string;
  let otherAcademyStudentId: string;
  const password = 'correct-horse-1';
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  const mail = (name: string) => `${name}-${stamp}@test.local`;

  const server = () => app.getHttpServer();
  const as = (token: string) => ({ Cookie: `access_token=${token}` });
  const api = (path: string) => `/api/v1${path}`;

  async function signIn(login: string) {
    const res = await request(server())
      .post(api('/auth/login'))
      .send({ login, password })
      .expect(200);
    return readCookies(res.headers['set-cookie']).access_token.value;
  }

  const valid = {
    name: 'طالب 1',
    age: 9,
    parentName: 'ولي امر 1',
    parentPhone: '010 1234-5678',
  };

  // Not async: it returns supertest's request, so a test can chain .expect(201).
  function createStudent(body: Record<string, unknown>, token = adminToken) {
    return request(server())
      .post(api('/students'))
      .set(as(token))
      .send({ ...valid, ...body });
  }

  async function list(query: Record<string, string | number | boolean> = {}, token = adminToken) {
    const res = await request(server())
      .get(api('/students'))
      .query(query)
      .set(as(token))
      .expect(200);
    return res.body as Page<Student>;
  }

  beforeAll(async () => {
    app = await createTestApp({ loginRateLimit: 1000 });
    prisma = app.get(PrismaService);
    academyId = await createAcademy(prisma, 'students');
    otherAcademyId = await createAcademy(prisma, 'students-other');
    await createUser(prisma, academyId, {
      name: 'Admin',
      email: mail('admin'),
      password,
      role: SystemRole.Admin,
    });
    await createUser(prisma, academyId, {
      name: 'Instructor',
      email: mail('instructor'),
      password,
      role: SystemRole.Instructor,
    });
    await createUser(prisma, otherAcademyId, {
      name: 'Other admin',
      email: mail('other-admin'),
      password,
      role: SystemRole.Admin,
    });
    adminToken = await signIn(mail('admin'));
    instructorToken = await signIn(mail('instructor'));
    const otherToken = await signIn(mail('other-admin'));
    otherAcademyStudentId = (
      (await createStudent({ code: 'KC-001', name: 'Other academy' }, otherToken).expect(201))
        .body as Student
    ).id;
  });

  afterAll(async () => {
    await removeAcademy(prisma, academyId);
    await removeAcademy(prisma, otherAcademyId);
    await app.close();
  });

  describe('create', () => {
    it('stores the code trimmed and uppercase and the phone normalized, with no group or cycle', async () => {
      const res = await createStudent({ code: '  kc-001 ', notes: '  يحب سكراتش ' }).expect(201);
      expect(res.body).toEqual({
        id: expect.any(String) as string,
        code: 'KC-001',
        name: 'طالب 1',
        age: 9,
        parentName: 'ولي امر 1',
        parentPhone: '01012345678',
        notes: 'يحب سكراتش',
        isActive: true,
        currentGroup: null,
        currentCycle: null,
      });
      const row = await prisma.unscoped.student.findUniqueOrThrow({
        where: { id: (res.body as Student).id },
      });
      expect(row.academyId).toBe(academyId);
    });

    it('AC: refuses a code already used in the academy, in any case or digit form (409)', async () => {
      for (const code of ['KC-001', 'kc-001', ' Kc-001 ', 'KC-٠٠١']) {
        const res = await createStudent({ code }).expect(409);
        expect(res.body).toMatchObject({ status: 409, code: 'STUDENT_CODE_TAKEN' });
      }
    });

    it('allows a code that another academy uses', async () => {
      // KC-001 exists in both academies now; the other one was created in beforeAll.
      const row = await prisma.unscoped.student.findUniqueOrThrow({
        where: { id: otherAcademyStudentId },
      });
      expect(row).toMatchObject({ code: 'KC-001', academyId: otherAcademyId });
    });

    it('accepts no age and no notes (null)', async () => {
      const res = await createStudent({ code: 'KC-002', age: undefined }).expect(201);
      expect(res.body).toMatchObject({ age: null, notes: null });
      const empty = await createStudent({ code: 'KC-003', notes: '   ' }).expect(201);
      expect(empty.body).toMatchObject({ notes: null });
    });

    it.each([
      ['an age of 2', { age: 2 }],
      ['an age of 26', { age: 26 }],
      ['a decimal age', { age: 9.5 }],
      ['a bad phone', { parentPhone: '12ab' }],
      ['a blank name', { name: '   ' }],
      ['no parent name', { parentName: undefined }],
      ['a code with a space', { code: 'KC 9' }],
      ['a code with %', { code: 'KC%9' }],
      ['a long code', { code: 'K'.repeat(21) }],
      ['an unknown field', { isActive: false }],
    ])('refuses %s (400)', async (_label, body) => {
      const res = await createStudent({
        code: `KC-V${Math.random().toString(36).slice(2, 6)}`,
        ...body,
      }).expect(400);
      expect(res.body).toMatchObject({ code: 'VALIDATION_FAILED' });
    });
  });

  describe('list and get', () => {
    let inactiveId: string;
    beforeAll(async () => {
      inactiveId = (
        (await createStudent({ code: 'KC-050', name: 'متوقف' }).expect(201)).body as Student
      ).id;
      await request(server())
        .post(api(`/students/${inactiveId}/deactivate`))
        .set(as(adminToken))
        .expect(200);
    });

    it('lists the academy’s students with pagination meta, never another academy’s', async () => {
      const page = await list({ pageSize: 100 });
      expect(page.meta).toEqual({ page: 1, pageSize: 100, total: page.data.length });
      expect(page.data.map((s) => s.id)).not.toContain(otherAcademyStudentId);
      expect(page.data.length).toBeGreaterThanOrEqual(4);

      const second = await list({ page: 2, pageSize: 2 });
      expect(second.meta).toEqual({ page: 2, pageSize: 2, total: page.meta.total });
      expect(second.data.map((s) => s.id)).toEqual(page.data.slice(2, 4).map((s) => s.id));
    });

    it('filters by isActive, and keeps a deactivated student', async () => {
      expect((await list({ isActive: false })).data.map((s) => s.id)).toEqual([inactiveId]);
      expect((await list({ isActive: true, pageSize: 100 })).data.map((s) => s.id)).not.toContain(
        inactiveId,
      );
    });

    it('returns an empty page for a group filter, since nobody is enrolled yet', async () => {
      expect(await list({ groupId: randomUUID() })).toEqual({
        data: [],
        meta: { page: 1, pageSize: 20, total: 0 },
      });
    });

    it.each([[{ groupId: 'nope' }], [{ isActive: 'yes' }], [{ pageSize: 101 }]])(
      'refuses the query %j (400)',
      async (query) => {
        await request(server()).get(api('/students')).query(query).set(as(adminToken)).expect(400);
      },
    );

    it('gets one student, and 404 for another academy’s or an unknown id', async () => {
      const res = await request(server())
        .get(api(`/students/${inactiveId}`))
        .set(as(adminToken))
        .expect(200);
      expect(res.body).toMatchObject({ id: inactiveId, code: 'KC-050', isActive: false });
      for (const id of [otherAcademyStudentId, randomUUID()]) {
        const missing = await request(server())
          .get(api(`/students/${id}`))
          .set(as(adminToken))
          .expect(404);
        expect(missing.body).toMatchObject({ code: 'NOT_FOUND' });
      }
      await request(server()).get(api('/students/42')).set(as(adminToken)).expect(400);
    });
  });

  describe('update and deactivate', () => {
    let id: string;
    const patch = (body: object) =>
      request(server())
        .patch(api(`/students/${id}`))
        .set(as(adminToken))
        .send(body);

    beforeAll(async () => {
      id = ((await createStudent({ code: 'KC-100' }).expect(201)).body as Student).id;
    });

    it('changes the fields sent, normalized, and null clears age and notes', async () => {
      const res = await patch({
        code: ' kc-101 ',
        parentPhone: '+20 10 1111 2222',
        notes: 'x',
      }).expect(200);
      expect(res.body).toMatchObject({
        code: 'KC-101',
        parentPhone: '+201011112222',
        notes: 'x',
        age: 9,
      });
      const cleared = await patch({ age: null, notes: null }).expect(200);
      expect(cleared.body).toMatchObject({ age: null, notes: null, name: 'طالب 1' });
    });

    it('refuses another student’s code (409) and a null required field (400)', async () => {
      const res = await patch({ code: 'kc-001' }).expect(409);
      expect(res.body).toMatchObject({ code: 'STUDENT_CODE_TAKEN' });
      await patch({ name: null }).expect(400);
      await patch({ age: 30 }).expect(400);
    });

    it('answers 404 for another academy’s student', async () => {
      await request(server())
        .patch(api(`/students/${otherAcademyStudentId}`))
        .set(as(adminToken))
        .send({ name: 'Hacked' })
        .expect(404);
      const other = await prisma.unscoped.student.findUniqueOrThrow({
        where: { id: otherAcademyStudentId },
      });
      expect(other.name).toBe('Other academy');
    });

    it('deactivates without deleting, idempotently', async () => {
      for (let i = 0; i < 2; i++) {
        const res = await request(server())
          .post(api(`/students/${id}/deactivate`))
          .set(as(adminToken))
          .expect(200);
        expect(res.body).toMatchObject({ id, isActive: false });
      }
      expect(await prisma.unscoped.student.count({ where: { id } })).toBe(1);
    });
  });

  describe('permissions', () => {
    it('an instructor (students.read:own) with no group sees no students and gets 403', async () => {
      // Scope own is the students enrolled in the caller's groups (enrollments.e2e-spec.ts);
      // this instructor teaches no group, so none are theirs.
      expect(await list({}, instructorToken)).toEqual({
        data: [],
        meta: { page: 1, pageSize: 20, total: 0 },
      });
      const any = (await list({ pageSize: 1 })).data[0];
      const res = await request(server())
        .get(api(`/students/${any.id}`))
        .set(as(instructorToken))
        .expect(403);
      expect(res.body).toMatchObject({ code: 'FORBIDDEN' });
    });

    it.each([
      ['post', '/students'],
      ['patch', `/students/${randomUUID()}`],
      ['post', `/students/${randomUUID()}/deactivate`],
    ] as const)('refuses an instructor: %s %s (403)', async (method, path) => {
      const res = await request(server())
        [method](api(path))
        .set(as(instructorToken))
        .send({ ...valid, code: 'KC-999' });
      expect(res.status).toBe(403);
      expect(res.body).toMatchObject({ code: 'FORBIDDEN' });
    });
  });

  describe('database checks (they hold whoever writes the row)', () => {
    const insert = (code: string, phone: string, age: number | null = null) =>
      prisma.unscoped.$executeRaw`
        INSERT INTO students
          (id, academy_id, code, name, name_search, parent_name, parent_phone, age, updated_at)
        VALUES (${randomUUID()}::uuid, ${academyId}::uuid, ${code}, 'raw', 'raw', 'raw', ${phone},
          ${age}, now())`;

    it.each([
      ['a lowercase code', 'kc-raw', '01012345678', null],
      ['a code with spaces around', ' KC-RAW ', '01012345678', null],
      ['an empty code', '', '01012345678', null],
      ['a phone with spaces', 'KC-RAW1', '010 1234 5678', null],
      ['an age of 30', 'KC-RAW2', '01012345678', 30],
    ])('refuses %s', async (_label, code, phone, age) => {
      await expect(insert(code, phone, age)).rejects.toThrow();
    });

    it('accepts a row in the stored form', async () => {
      await expect(insert('KC-RAW3', '01012345678', 10)).resolves.toBe(1);
    });
  });
});
