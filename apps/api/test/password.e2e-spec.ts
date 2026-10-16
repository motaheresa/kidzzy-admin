import type { INestApplication } from '@nestjs/common';
import { SystemRole } from '@kidzzy/shared';
import request from 'supertest';
import type { App } from 'supertest/types';
import { PrismaService } from '../src/modules/prisma/prisma.service';
import { createAcademy, createTestApp, createUser, readCookies, removeAcademy } from './helpers';

// US-02 (SCRUM-16). AC: the admin sets a temporary password; the instructor must change it at
// the next login.

describe('Temporary passwords and password change (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let academyId: string;
  let adminId: string;
  let adminToken: string;
  const password = 'correct-horse-1';
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  const mail = (name: string) => `${name}-${stamp}@test.local`;

  const server = () => app.getHttpServer();
  const api = (path: string) => `/api/v1${path}`;
  const as = (token: string) => ({ Cookie: `access_token=${token}` });

  async function signIn(login: string, pass: string) {
    const res = await request(server()).post(api('/auth/login')).send({ login, password: pass });
    const cookies = readCookies(res.headers['set-cookie']);
    return {
      status: res.status,
      body: res.body as { mustChangePassword?: boolean },
      access: cookies.access_token?.value ?? '',
      refresh: cookies.refresh_token?.value ?? '',
    };
  }
  const refresh = (token: string) =>
    request(server()).post(api('/auth/refresh')).set('Cookie', `refresh_token=${token}`);
  const reset = (id: string, temporaryPassword: string, token = adminToken) =>
    request(server())
      .post(api(`/instructors/${id}/reset-password`))
      .set(as(token))
      .send({ temporaryPassword });
  const change = (token: string, currentPassword: string, newPassword: string) =>
    request(server())
      .post(api('/auth/change-password'))
      .set(as(token))
      .send({ currentPassword, newPassword });

  async function newInstructor(name: string) {
    const email = mail(name);
    const id = await createUser(prisma, academyId, {
      name,
      email,
      password,
      role: SystemRole.Instructor,
    });
    return { id, email };
  }

  beforeAll(async () => {
    app = await createTestApp({ loginRateLimit: 1000, passwordRateLimit: 1000 });
    prisma = app.get(PrismaService);
    academyId = await createAcademy(prisma, 'password');
    adminId = await createUser(prisma, academyId, {
      name: 'Admin',
      email: mail('admin'),
      password,
      role: SystemRole.Admin,
    });
    adminToken = (await signIn(mail('admin'), password)).access;
  });

  afterAll(async () => {
    await removeAcademy(prisma, academyId);
    await app.close();
  });

  describe('reset by the admin', () => {
    it('sets a temporary password, ends every session, and the old password stops working', async () => {
      const { id, email } = await newInstructor('reset');
      const phone = await signIn(email, password);
      const laptop = await signIn(email, password);

      await reset(id, 'temp-pass-1').expect(204);

      // Every session ends: no refresh works.
      await refresh(phone.refresh).expect(401);
      await refresh(laptop.refresh).expect(401);
      expect((await signIn(email, password)).status).toBe(401);

      // AC: the temporary password works, and the session says it must be changed.
      const fresh = await signIn(email, 'temp-pass-1');
      expect(fresh.status).toBe(200);
      expect(fresh.body.mustChangePassword).toBe(true);
      const user = await prisma.unscoped.user.findUniqueOrThrow({ where: { id } });
      expect(user.mustChangePassword).toBe(true);
    });

    it('answers 404 for an admin, 400 for a short password, 403 for an instructor', async () => {
      await reset(adminId, 'temp-pass-1').expect(404);
      await reset(adminId, 'short').expect(400);
      const { id, email } = await newInstructor('not-allowed');
      const instructor = await signIn(email, password);
      const res = await reset(id, 'temp-pass-1', instructor.access).expect(403);
      expect(res.body).toMatchObject({ code: 'FORBIDDEN' });
    });
  });

  describe('while the password must be changed', () => {
    it('AC: refuses everything else with 403 PASSWORD_CHANGE_REQUIRED, but me and logout work', async () => {
      const { id, email } = await newInstructor('must-change');
      await reset(id, 'temp-pass-1').expect(204);
      const session = await signIn(email, 'temp-pass-1');

      for (const path of ['/students', '/instructors']) {
        const res = await request(server()).get(api(path)).set(as(session.access)).expect(403);
        expect(res.body).toMatchObject({ code: 'PASSWORD_CHANGE_REQUIRED' });
      }
      const me = await request(server()).get(api('/auth/me')).set(as(session.access)).expect(200);
      expect(me.body).toMatchObject({ mustChangePassword: true });

      // The refresh keeps the flag: a new token does not escape the rule.
      const refreshed = readCookies(
        (await refresh(session.refresh).expect(204)).headers['set-cookie'],
      );
      await request(server())
        .get(api('/students'))
        .set(as(refreshed.access_token.value))
        .expect(403);

      await request(server())
        .post(api('/auth/logout'))
        .set(as(refreshed.access_token.value))
        .expect(204);
    });
  });

  describe('change by the user', () => {
    it('replaces the password, clears the flag, keeps this device and ends the others', async () => {
      const { id, email } = await newInstructor('changer');
      await reset(id, 'temp-pass-1').expect(204);
      const thisDevice = await signIn(email, 'temp-pass-1');
      const otherDevice = await signIn(email, 'temp-pass-1');

      const res = await change(thisDevice.access, 'temp-pass-1', 'my-own-pass-1').expect(204);
      const cookies = readCookies(res.headers['set-cookie']);
      expect(cookies.access_token.value).toBeTruthy();
      expect(cookies.refresh_token.value).toBeTruthy();

      // This device goes on with the new cookies, and the rule no longer applies.
      const me = await request(server())
        .get(api('/auth/me'))
        .set(as(cookies.access_token.value))
        .expect(200);
      expect(me.body).toMatchObject({ mustChangePassword: false });
      // students.read:own: allowed now (empty until groups exist).
      await request(server()).get(api('/students')).set(as(cookies.access_token.value)).expect(200);
      await refresh(cookies.refresh_token.value).expect(204);

      // Every older session ends, on this device too: its new session replaced it.
      await refresh(otherDevice.refresh).expect(401);
      await refresh(thisDevice.refresh).expect(401);

      expect((await signIn(email, 'temp-pass-1')).status).toBe(401);
      const fresh = await signIn(email, 'my-own-pass-1');
      expect(fresh.status).toBe(200);
      expect(fresh.body.mustChangePassword).toBe(false);
    });

    it('lets any signed-in user change a password, not only after a reset', async () => {
      const email = mail('admin-change');
      await createUser(prisma, academyId, {
        name: 'Admin 2',
        email,
        password,
        role: SystemRole.Admin,
      });
      const session = await signIn(email, password);
      await change(session.access, password, 'another-pass-1').expect(204);
      expect((await signIn(email, 'another-pass-1')).status).toBe(200);
    });

    it('refuses a wrong current password (422) and the same password (422), changing nothing', async () => {
      const { email } = await newInstructor('refused');
      const session = await signIn(email, password);

      const wrong = await change(session.access, 'not-my-password', 'new-pass-123').expect(422);
      expect(wrong.body).toMatchObject({ status: 422, code: 'CURRENT_PASSWORD_INCORRECT' });
      const same = await change(session.access, password, password).expect(422);
      expect(same.body).toMatchObject({ status: 422, code: 'PASSWORD_UNCHANGED' });

      expect((await signIn(email, password)).status).toBe(200);
      await refresh(session.refresh).expect(204);
    });

    it.each([
      ['a short new password', { currentPassword: password, newPassword: 'short' }],
      ['no current password', { newPassword: 'new-pass-123' }],
      ['an unknown field', { currentPassword: password, newPassword: 'new-pass-123', x: 1 }],
    ])('refuses %s (400)', async (_label, body) => {
      const { email } = await newInstructor(`bad-${Math.random().toString(36).slice(2, 6)}`);
      const session = await signIn(email, password);
      await request(server())
        .post(api('/auth/change-password'))
        .set(as(session.access))
        .send(body)
        .expect(400);
    });

    it('refuses a caller who is not signed in (401)', async () => {
      await request(server())
        .post(api('/auth/change-password'))
        .send({ currentPassword: password, newPassword: 'new-pass-123' })
        .expect(401);
    });
  });

  describe('rate limit', () => {
    it('allows 5 attempts a minute per user, then 429, without touching the login limit', async () => {
      const limited = await createTestApp({ loginRateLimit: 1000, passwordRateLimit: 5 });
      try {
        const { email } = await newInstructor('throttled');
        const login = await request(limited.getHttpServer())
          .post(api('/auth/login'))
          .send({ login: email, password })
          .expect(200);
        const token = readCookies(login.headers['set-cookie']).access_token.value;
        const attempt = () =>
          request(limited.getHttpServer())
            .post(api('/auth/change-password'))
            .set(as(token))
            .send({ currentPassword: 'wrong-password', newPassword: 'new-pass-123' });

        for (let i = 0; i < 5; i++) await attempt().expect(422);
        const blocked = await attempt().expect(429);
        expect(blocked.body).toMatchObject({ code: 'RATE_LIMITED' });

        // The login throttler is separate: logging in still works.
        await request(limited.getHttpServer())
          .post(api('/auth/login'))
          .send({ login: email, password })
          .expect(200);
      } finally {
        await limited.close();
      }
    });
  });
});
