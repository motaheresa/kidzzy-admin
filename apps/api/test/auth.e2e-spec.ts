import type { INestApplication } from '@nestjs/common';
import { SYSTEM_ROLE_PERMISSIONS, SystemRole } from '@kidzzy/shared';
import request from 'supertest';
import type { App } from 'supertest/types';
import { PrismaService } from '../src/modules/prisma/prisma.service';
import { createAcademy, createTestApp, createUser, readCookies, removeAcademy } from './helpers';

// US-01: staff login with email or phone. Runs against PostgreSQL (DATABASE_URL).

describe('Auth (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let academyId: string;
  const password = 'correct-horse-1';
  const email = `admin-${Date.now()}@test.local`;
  const phone = `0100${Date.now().toString().slice(-7)}`;
  const previousLimit = process.env.LOGIN_RATE_LIMIT;

  const login = (body: object) =>
    request(app.getHttpServer()).post('/api/v1/auth/login').send(body);
  const refresh = (token: string) =>
    request(app.getHttpServer())
      .post('/api/v1/auth/refresh')
      .set('Cookie', `refresh_token=${token}`);

  beforeAll(async () => {
    process.env.LOGIN_RATE_LIMIT = '1000'; // this file logs in many times; the limit has its own test
    app = await createTestApp();
    prisma = app.get(PrismaService);
    academyId = await createAcademy(prisma, 'auth');
    await createUser(prisma, academyId, {
      name: 'Admin',
      email,
      phone,
      password,
      role: SystemRole.Admin,
    });
    await createUser(prisma, academyId, {
      name: 'Gone',
      email: `gone-${email}`,
      password,
      role: SystemRole.Instructor,
      isActive: false,
    });
  });

  afterAll(async () => {
    await removeAcademy(prisma, academyId);
    await app.close();
    process.env.LOGIN_RATE_LIMIT = previousLimit;
  });

  describe('POST /auth/login', () => {
    it('logs in with email, in any letter case, and returns the user with permissions', async () => {
      const res = await login({ login: email.toUpperCase(), password }).expect(200);
      expect(res.body).toMatchObject({
        name: 'Admin',
        email,
        roles: ['Admin'],
        mustChangePassword: false,
        academy: { id: academyId, timezone: 'Africa/Cairo' },
      });
      expect([...(res.body as { permissions: string[] }).permissions].sort()).toEqual(
        [...SYSTEM_ROLE_PERMISSIONS.Admin].sort(),
      );
    });

    it('logs in with phone, ignoring spaces and dashes', async () => {
      const spaced = `${phone.slice(0, 3)} ${phone.slice(3, 7)}-${phone.slice(7)}`;
      await login({ login: spaced, password }).expect(200);
    });

    it('sets httpOnly, SameSite=Strict cookies, the refresh one only for /auth/refresh', async () => {
      const res = await login({ login: email, password }).expect(200);
      const cookies = readCookies(res.headers['set-cookie']);
      expect(cookies.access_token.attributes).toMatch(/Path=\/api;/);
      expect(cookies.refresh_token.attributes).toMatch(/Path=\/api\/v1\/auth\/refresh/);
      for (const { attributes } of Object.values(cookies)) {
        expect(attributes).toMatch(/HttpOnly/);
        expect(attributes).toMatch(/SameSite=Strict/);
      }
      expect(res.body).not.toHaveProperty('accessToken'); // tokens never appear in the body
    });

    it('answers wrong password, unknown login and deactivated account with one generic error', async () => {
      const wrong = await login({ login: email, password: 'wrong-password' }).expect(401);
      const unknown = await login({ login: 'nobody@test.local', password }).expect(401);
      const deactivated = await login({ login: `gone-${email}`, password }).expect(401);

      for (const res of [wrong, unknown, deactivated]) {
        expect(res.headers['content-type']).toMatch(/application\/problem\+json/);
        expect(res.headers['set-cookie']).toBeUndefined();
        expect(res.body).toEqual(wrong.body);
      }
      expect(wrong.body).toMatchObject({ status: 401, code: 'INVALID_CREDENTIALS' });
    });

    it('rejects a malformed body with VALIDATION_FAILED and field errors', async () => {
      const res = await login({ login: '', password: 'short', role: 'Admin' }).expect(400);
      expect(res.body).toMatchObject({ code: 'VALIDATION_FAILED' });
      const fields = (res.body as { errors: { field: string }[] }).errors.map((e) => e.field);
      expect(fields).toEqual(expect.arrayContaining(['login', 'password', 'role']));
    });
  });

  describe('signed-in routes', () => {
    it('reject a request without a valid access token', async () => {
      const server = app.getHttpServer();
      const none = await request(server).post('/api/v1/auth/logout').expect(401);
      expect(none.body).toMatchObject({ code: 'UNAUTHENTICATED' });
      await request(server)
        .post('/api/v1/auth/logout')
        .set('Cookie', 'access_token=not-a-jwt')
        .expect(401);
    });
  });

  describe('POST /auth/refresh', () => {
    it('rotates both cookies, and a reused refresh token ends the whole session', async () => {
      const first = readCookies((await login({ login: email, password })).headers['set-cookie']);

      const rotated = await refresh(first.refresh_token.value).expect(204);
      const second = readCookies(rotated.headers['set-cookie']);
      expect(second.refresh_token.value).not.toBe(first.refresh_token.value);
      expect(second.access_token.value).toBeTruthy();

      // Someone replays the old token: refused, and the newer token dies with it.
      await refresh(first.refresh_token.value).expect(401);
      await refresh(second.refresh_token.value).expect(401);
    });

    it('refuses a missing or unknown token', async () => {
      await request(app.getHttpServer()).post('/api/v1/auth/refresh').expect(401);
      await refresh('made-up-token').expect(401);
    });

    it('refuses a user deactivated after logging in', async () => {
      const userId = await createUser(prisma, academyId, {
        name: 'Soon gone',
        email: `soon-${email}`,
        password,
        role: SystemRole.Instructor,
      });
      const cookies = readCookies(
        (await login({ login: `soon-${email}`, password })).headers['set-cookie'],
      );
      await prisma.unscoped.user.update({ where: { id: userId }, data: { isActive: false } });
      await refresh(cookies.refresh_token.value).expect(401);
    });
  });

  describe('POST /auth/logout', () => {
    it('revokes the session and clears both cookies', async () => {
      const cookies = readCookies((await login({ login: email, password })).headers['set-cookie']);

      const res = await request(app.getHttpServer())
        .post('/api/v1/auth/logout')
        .set('Cookie', `access_token=${cookies.access_token.value}`)
        .expect(204);
      const cleared = readCookies(res.headers['set-cookie']);
      expect(cleared.access_token.value).toBe('');
      expect(cleared.refresh_token.value).toBe('');

      await refresh(cookies.refresh_token.value).expect(401);
    });
  });
});
