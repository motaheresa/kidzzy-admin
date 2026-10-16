import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { SystemRole, type Instructor, type Page } from '@kidzzy/shared';
import request from 'supertest';
import type { App } from 'supertest/types';
import { PrismaService } from '../src/modules/prisma/prisma.service';
import { createAcademy, createTestApp, createUser, readCookies, removeAcademy } from './helpers';

// US-04 (SCRUM-17): instructor accounts. AC: a deactivated instructor cannot log in, and their
// history stays (nothing is deleted). "Cannot be assigned to a new group" is tested in US-07.

describe('Instructors (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let academyId: string;
  let otherAcademyId: string;
  let adminId: string;
  let adminToken: string;
  let instructorToken: string;
  let otherAcademyInstructorId: string;
  const password = 'correct-horse-1';
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  const mail = (name: string) => `${name}-${stamp}@test.local`;
  // Phones are unique per academy, and every run has a fresh academy, so fixed numbers are safe.
  // (Emails carry the stamp: the login lookup crosses academies.)
  const phoneOf = (n: 1 | 2 | 3) => ({ 1: '01011112222', 2: '01033334444', 3: '01055556666' })[n];

  const server = () => app.getHttpServer();
  const as = (token: string) => ({ Cookie: `access_token=${token}` });
  const api = (path: string) => `/api/v1${path}`;

  async function signIn(login: string, pass = password) {
    const res = await request(server()).post(api('/auth/login')).send({ login, password: pass });
    return { status: res.status, cookies: readCookies(res.headers['set-cookie']) };
  }

  // Not async: it returns supertest's request, so a test can chain .expect(201).
  function createInstructor(body: Record<string, unknown>) {
    return request(server())
      .post(api('/instructors'))
      .set(as(adminToken))
      .send({ temporaryPassword: 'temp-pass-1', ...body });
  }

  async function list(query: Record<string, string | number | boolean> = {}) {
    const res = await request(server())
      .get(api('/instructors'))
      .query(query)
      .set(as(adminToken))
      .expect(200);
    return res.body as Page<Instructor>;
  }

  beforeAll(async () => {
    app = await createTestApp({ loginRateLimit: 1000 });
    prisma = app.get(PrismaService);
    academyId = await createAcademy(prisma, 'instructors');
    otherAcademyId = await createAcademy(prisma, 'instructors-other');
    adminId = await createUser(prisma, academyId, {
      name: 'Admin',
      email: mail('admin'),
      password,
      role: SystemRole.Admin,
    });
    await createUser(prisma, academyId, {
      name: 'Existing instructor',
      email: mail('existing'),
      password,
      role: SystemRole.Instructor,
    });
    otherAcademyInstructorId = await createUser(prisma, otherAcademyId, {
      name: 'Other academy instructor',
      email: mail('other'),
      password,
      role: SystemRole.Instructor,
    });
    adminToken = (await signIn(mail('admin'))).cookies.access_token.value;
    instructorToken = (await signIn(mail('existing'))).cookies.access_token.value;
  });

  afterAll(async () => {
    await removeAcademy(prisma, academyId);
    await removeAcademy(prisma, otherAcademyId);
    await app.close();
  });

  describe('create', () => {
    it('creates the account with the Instructor role and a password to change, normalized', async () => {
      const res = await createInstructor({
        name: '  Mona Adel ',
        email: `  Mona-${stamp}@Test.LOCAL `,
        phone: '010 1234-5678',
      }).expect(201);
      const body = res.body as Instructor;
      expect(body).toEqual({
        id: expect.any(String) as string,
        name: 'Mona Adel',
        email: `mona-${stamp}@test.local`,
        phone: '01012345678',
        isActive: true,
        createdAt: expect.any(String) as string,
      });
      expect(Object.keys(body)).not.toContain('passwordHash');

      const user = await prisma.unscoped.user.findUniqueOrThrow({
        where: { id: body.id },
        include: { roles: { include: { role: true } } },
      });
      expect(user.academyId).toBe(academyId);
      expect(user.mustChangePassword).toBe(true);
      expect(user.passwordHash).toMatch(/^\$argon2id\$/);
      expect(user.roles.map(({ role }) => role.name)).toEqual([SystemRole.Instructor]);
      expect(user.roles[0].role.academyId).toBe(academyId);

      // The temporary password works, and the session says it must be changed.
      const login = await request(server())
        .post(api('/auth/login'))
        .send({ login: `mona-${stamp}@test.local`, password: 'temp-pass-1' })
        .expect(200);
      expect(login.body).toMatchObject({ mustChangePassword: true, roles: ['Instructor'] });
    });

    it('accepts a phone only', async () => {
      const res = await createInstructor({ name: 'Phone only', phone: phoneOf(1) }).expect(201);
      expect(res.body).toMatchObject({ email: null, phone: phoneOf(1) });
    });

    it('refuses neither email nor phone (400, both fields)', async () => {
      const res = await createInstructor({ name: 'Nobody' }).expect(400);
      expect(res.body).toMatchObject({ code: 'VALIDATION_FAILED' });
      const fields = (res.body as { errors: { field: string }[] }).errors.map((e) => e.field);
      expect(new Set(fields)).toEqual(new Set(['email', 'phone']));
    });

    it.each([
      ['a bad email', { email: 'not-an-email' }],
      ['a bad phone', { phone: '12ab' }],
      ['a short password', { email: 'short@test.local', temporaryPassword: 'short' }],
      ['an unknown field', { email: 'x@test.local', isActive: false }],
    ])('refuses %s (400)', async (_label, body) => {
      await createInstructor({ name: 'Bad', ...body }).expect(400);
    });

    it('refuses an email or a phone already used in the academy (409), even by an admin', async () => {
      const email = await createInstructor({ name: 'Dup', email: mail('admin') }).expect(409);
      expect(email.body).toMatchObject({ status: 409, code: 'EMAIL_TAKEN' });
      // Normalized before the comparison: the same email in another case is the same email.
      const upper = await createInstructor({ name: 'Dup', email: mail('ADMIN') }).expect(409);
      expect(upper.body).toMatchObject({ code: 'EMAIL_TAKEN' });

      await createInstructor({ name: 'First', phone: phoneOf(2) }).expect(201);
      const phone = await createInstructor({ name: 'Dup', phone: phoneOf(2) }).expect(409);
      expect(phone.body).toMatchObject({ code: 'PHONE_TAKEN' });
    });

    it('allows the same email in another academy', async () => {
      // mail('other') belongs to the other academy's instructor.
      await createInstructor({ name: 'Same email elsewhere', email: mail('other') }).expect(201);
    });
  });

  describe('list', () => {
    beforeAll(async () => {
      await createInstructor({ name: 'Search Target', email: mail('target') }).expect(201);
      await createInstructor({ name: 'Percent 100% sure', email: mail('percent') }).expect(201);
      await createInstructor({ name: 'Under_score', email: mail('under') }).expect(201);
      const sleeper = await createInstructor({ name: 'Sleeping', email: mail('sleep') });
      await request(server())
        .post(api(`/instructors/${(sleeper.body as Instructor).id}/deactivate`))
        .set(as(adminToken))
        .expect(200);
    });

    it('lists only instructors of the academy, never the admin, sorted by name', async () => {
      const page = await list({ pageSize: 100 });
      const ids = page.data.map((i) => i.id);
      expect(ids).not.toContain(adminId);
      expect(ids).not.toContain(otherAcademyInstructorId);
      // Sorted by name (the database collation decides ties of case and spaces).
      const names = page.data.map((i) => i.name);
      expect(names.indexOf('Percent 100% sure')).toBeLessThan(names.indexOf('Search Target'));
      expect(names.indexOf('Search Target')).toBeLessThan(names.indexOf('Under_score'));
      expect(page.meta).toEqual({ page: 1, pageSize: 100, total: page.data.length });
    });

    it('paginates with the total of all matches', async () => {
      const all = await list({ pageSize: 100 });
      const second = await list({ page: 2, pageSize: 2 });
      expect(second.meta).toEqual({ page: 2, pageSize: 2, total: all.meta.total });
      expect(second.data.map((i) => i.id)).toEqual(all.data.slice(2, 4).map((i) => i.id));
      const beyond = await list({ page: 999, pageSize: 2 });
      expect(beyond).toEqual({ data: [], meta: { page: 999, pageSize: 2, total: all.meta.total } });
    });

    it('searches part of the name (any case), the email, or the phone digits', async () => {
      expect((await list({ search: 'arch tar' })).data.map((i) => i.name)).toEqual([
        'Search Target',
      ]);
      expect((await list({ search: `TARGET-${stamp}` })).data.map((i) => i.name)).toEqual([
        'Search Target',
      ]);
      const byPhone = await list({ search: '1111-22' });
      expect(byPhone.data.map((i) => i.name)).toEqual(['Phone only']);
    });

    it('treats % and _ as plain characters', async () => {
      expect((await list({ search: '%' })).data.map((i) => i.name)).toEqual(['Percent 100% sure']);
      expect((await list({ search: '_' })).data.map((i) => i.name)).toEqual(['Under_score']);
    });

    it('filters by isActive', async () => {
      const inactive = await list({ isActive: false, pageSize: 100 });
      expect(inactive.data.map((i) => i.name)).toEqual(['Sleeping']);
      const active = await list({ isActive: true, pageSize: 100 });
      expect(active.data.every((i) => i.isActive)).toBe(true);
      expect(active.data.map((i) => i.name)).not.toContain('Sleeping');
    });

    it.each([
      [{ page: 0 }],
      [{ pageSize: 101 }],
      [{ page: 'two' }],
      [{ isActive: 'yes' }],
      [{ role: 'admin' }],
    ])('refuses the query %j (400)', async (query) => {
      await request(server()).get(api('/instructors')).query(query).set(as(adminToken)).expect(400);
    });
  });

  describe('get', () => {
    it('returns the instructor with no groups yet', async () => {
      const created = (await createInstructor({ name: 'Detail', email: mail('detail') }))
        .body as Instructor;
      const res = await request(server())
        .get(api(`/instructors/${created.id}`))
        .set(as(adminToken))
        .expect(200);
      expect(res.body).toEqual({ ...created, groups: [] });
    });

    it.each([
      ['an admin', () => adminId],
      ['another academy’s instructor', () => otherAcademyInstructorId],
      ['an unknown id', () => randomUUID()],
    ])('answers 404 for %s', async (_label, id) => {
      const res = await request(server())
        .get(api(`/instructors/${id()}`))
        .set(as(adminToken))
        .expect(404);
      expect(res.body).toMatchObject({ code: 'NOT_FOUND' });
    });

    it('answers 400 for an id that is not a UUID', async () => {
      await request(server()).get(api('/instructors/42')).set(as(adminToken)).expect(400);
    });
  });

  describe('update', () => {
    let id: string;
    beforeAll(async () => {
      id = ((await createInstructor({ name: 'Editable', email: mail('edit') })).body as Instructor)
        .id;
    });
    const patch = (body: object, target = () => id) =>
      request(server())
        .patch(api(`/instructors/${target()}`))
        .set(as(adminToken))
        .send(body);

    it('changes the name and adds a phone, normalized', async () => {
      const res = await patch({ name: 'Edited', phone: ` ${phoneOf(3)} ` }).expect(200);
      expect(res.body).toMatchObject({ name: 'Edited', email: mail('edit'), phone: phoneOf(3) });
    });

    it('removes the email when a phone remains, and refuses removing both (400)', async () => {
      await patch({ email: null }).expect(200);
      const res = await patch({ phone: null }).expect(400);
      expect(res.body).toMatchObject({ code: 'VALIDATION_FAILED' });
      const user = await prisma.unscoped.user.findUniqueOrThrow({ where: { id } });
      expect(user).toMatchObject({ email: null, phone: phoneOf(3) });
      await patch({ email: mail('edit') }).expect(200);
    });

    it('refuses an email used by another account (409)', async () => {
      const res = await patch({ email: mail('admin') }).expect(409);
      expect(res.body).toMatchObject({ code: 'EMAIL_TAKEN' });
    });

    it('answers 404 for an admin and 400 for a null name', async () => {
      await patch({ name: 'Hacked' }, () => adminId).expect(404);
      await patch({ name: null }).expect(400);
    });
  });

  describe('deactivate and reactivate', () => {
    it('signs the instructor out and stops the login, keeps the row, and reactivates', async () => {
      const email = mail('leaving');
      const created = (
        await createInstructor({ name: 'Leaving', email, temporaryPassword: password })
      ).body as Instructor;
      const session = await signIn(email);
      expect(session.status).toBe(200);

      const res = await request(server())
        .post(api(`/instructors/${created.id}/deactivate`))
        .set(as(adminToken))
        .expect(200);
      expect(res.body).toEqual({ ...created, isActive: false });

      // AC: cannot log in, and the session cannot be refreshed.
      expect((await signIn(email)).status).toBe(401);
      await request(server())
        .post(api('/auth/refresh'))
        .set('Cookie', `refresh_token=${session.cookies.refresh_token.value}`)
        .expect(401);

      // AC: the history stays; nothing was deleted.
      const listed = await list({ isActive: false, pageSize: 100 });
      expect(listed.data.map((i) => i.id)).toContain(created.id);

      // Idempotent.
      await request(server())
        .post(api(`/instructors/${created.id}/deactivate`))
        .set(as(adminToken))
        .expect(200);

      const back = await request(server())
        .post(api(`/instructors/${created.id}/reactivate`))
        .set(as(adminToken))
        .expect(200);
      expect(back.body).toMatchObject({ isActive: true });
      expect((await signIn(email)).status).toBe(200);
    });

    it('answers 404 for an admin', async () => {
      await request(server())
        .post(api(`/instructors/${adminId}/deactivate`))
        .set(as(adminToken))
        .expect(404);
      const admin = await prisma.unscoped.user.findUniqueOrThrow({ where: { id: adminId } });
      expect(admin.isActive).toBe(true);
    });
  });

  describe('permissions', () => {
    it.each([
      ['get', '/instructors'],
      ['post', '/instructors'],
      ['get', `/instructors/${randomUUID()}`],
      ['patch', `/instructors/${randomUUID()}`],
      ['post', `/instructors/${randomUUID()}/deactivate`],
      ['post', `/instructors/${randomUUID()}/reactivate`],
    ] as const)('refuses an instructor: %s %s (403)', async (method, path) => {
      const res = await request(server())[method](api(path)).set(as(instructorToken)).send({});
      expect(res.status).toBe(403);
      expect(res.body).toMatchObject({ code: 'FORBIDDEN' });
    });

    it('refuses a caller who is not signed in (401)', async () => {
      await request(server()).get(api('/instructors')).expect(401);
    });
  });
});
