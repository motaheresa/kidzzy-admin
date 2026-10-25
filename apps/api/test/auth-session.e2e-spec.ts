import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SystemRole } from '@kidzzy/shared';
import request from 'supertest';
import type { App } from 'supertest/types';
import { PrismaService } from '../src/modules/prisma/prisma.service';
import {
  createAcademy,
  createTestApp,
  createUser,
  readCookies,
  removeAcademy,
  signTestJwt,
} from './helpers';

// SCRUM-54: the life of a session. Logout that works without a valid access token, the refresh
// cookie's path, the cookie left at the old path, and the absolute lifetime of 30 days.

const DAY = 24 * 60 * 60 * 1000;
const START = new Date('2026-10-01T10:00:00.000Z');

describe('Session lifecycle (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let academyId: string;
  let userId: string;
  let secret: string;
  let current = START;
  const password = 'correct-horse-1';
  const email = `session-${Date.now()}@test.local`;

  const server = () => app.getHttpServer();
  const login = () => request(server()).post('/api/v1/auth/login').send({ login: email, password });
  const cookieHeader = (...pairs: string[]) => pairs.join('; ');
  const refresh = (...pairs: string[]) =>
    request(server())
      .post('/api/v1/auth/refresh')
      .set('Cookie', cookieHeader(...pairs));
  const logout = (...pairs: string[]) => {
    const req = request(server()).post('/api/v1/auth/logout');
    return pairs.length > 0 ? req.set('Cookie', cookieHeader(...pairs)) : req;
  };
  const now = () => Math.floor(Date.now() / 1000);

  /** A login at the current (fixed) time; the cookies it set. */
  async function signIn() {
    const res = await login().expect(200);
    return readCookies(res.headers['set-cookie']);
  }
  const setCookies = (res: { headers: Record<string, unknown> }) =>
    (res.headers['set-cookie'] as string[] | undefined) ?? [];
  /** The tokens of the user's newest session, oldest first. */
  async function latestFamily() {
    const newest = await prisma.unscoped.refreshToken.findFirstOrThrow({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });
    return prisma.unscoped.refreshToken.findMany({
      where: { familyId: newest.familyId },
      orderBy: { createdAt: 'asc' },
    });
  }

  beforeAll(async () => {
    app = await createTestApp({ loginRateLimit: 1000, now: () => current });
    prisma = app.get(PrismaService);
    secret = app.get(ConfigService).getOrThrow<string>('JWT_ACCESS_SECRET');
    academyId = await createAcademy(prisma, 'auth-session');
    userId = await createUser(prisma, academyId, {
      name: 'Admin',
      email,
      password,
      role: SystemRole.Admin,
    });
  });

  beforeEach(() => {
    current = START;
  });

  afterAll(async () => {
    await removeAcademy(prisma, academyId);
    await app.close();
  });

  describe('the refresh cookie’s path', () => {
    it('is /api/v1/auth, and the old path is expired next to it on login, refresh and logout', async () => {
      const loggedIn = await login().expect(200);
      const first = readCookies(loggedIn.headers['set-cookie']);
      expect(first.refresh_token.attributes).toMatch(/Path=\/api\/v1\/auth;/);

      const refreshed = await refresh(`refresh_token=${first.refresh_token.value}`).expect(204);
      const loggedOut = await logout(
        `refresh_token=${readCookies(refreshed.headers['set-cookie']).refresh_token.value}`,
      ).expect(204);

      for (const res of [loggedIn, refreshed, loggedOut]) {
        const legacy = setCookies(res).filter(
          (header) =>
            header.startsWith('refresh_token=;') &&
            /Path=\/api\/v1\/auth\/refresh(;|$)/.test(header),
        );
        expect(legacy).toHaveLength(1);
        expect(legacy[0]).toMatch(/Expires=Thu, 01 Jan 1970/);
      }
    });
  });

  describe('POST /auth/logout', () => {
    it('revokes the whole session from the refresh cookie when the access token expired', async () => {
      const cookies = await signIn();
      const expired = signTestJwt(
        {
          sub: userId,
          aid: academyId,
          sid: randomUUID(),
          perms: [],
          mustChangePassword: false,
          exp: now() - 60,
        },
        secret,
      );

      const res = await logout(
        `access_token=${expired}`,
        `refresh_token=${cookies.refresh_token.value}`,
      ).expect(204);

      const cleared = readCookies(res.headers['set-cookie']);
      expect(cleared.access_token.value).toBe('');
      expect(cleared.refresh_token.value).toBe('');
      await refresh(`refresh_token=${cookies.refresh_token.value}`).expect(401);
    });

    it('revokes every token of the family, also the ones already rotated', async () => {
      const first = await signIn();
      const second = readCookies(
        (await refresh(`refresh_token=${first.refresh_token.value}`).expect(204)).headers[
          'set-cookie'
        ],
      );
      await logout(`refresh_token=${second.refresh_token.value}`).expect(204);

      const family = await latestFamily();
      expect(family.length).toBeGreaterThanOrEqual(2);
      expect(family.every((token) => token.revokedAt !== null)).toBe(true);
    });

    it('revokes the session from a valid access token alone (no refresh cookie sent)', async () => {
      const cookies = await signIn();
      await logout(`access_token=${cookies.access_token.value}`).expect(204);
      await refresh(`refresh_token=${cookies.refresh_token.value}`).expect(401);
    });

    it('with an expired access token and no refresh cookie: 204, cookies cleared, nothing revoked', async () => {
      const cookies = await signIn();
      const expired = signTestJwt(
        {
          sub: userId,
          aid: academyId,
          sid: randomUUID(),
          perms: [],
          mustChangePassword: false,
          exp: now() - 60,
        },
        secret,
      );

      const res = await logout(`access_token=${expired}`).expect(204);
      expect(readCookies(res.headers['set-cookie']).refresh_token.value).toBe('');
      // The session is still alive: only a request that proves it can end it.
      await refresh(`refresh_token=${cookies.refresh_token.value}`).expect(204);
    });

    it('with no cookies at all: 204 and both cookies cleared (idempotent, nothing leaks)', async () => {
      const res = await logout().expect(204);
      const headers = setCookies(res);
      expect(headers.some((h) => h.startsWith('access_token=;') && /Path=\/api;/.test(h))).toBe(
        true,
      );
      expect(
        headers.some((h) => h.startsWith('refresh_token=;') && /Path=\/api\/v1\/auth;/.test(h)),
      ).toBe(true);
      // The same answer for a made-up token as for no token.
      const unknown = await logout('refresh_token=made-up', 'access_token=not-a-jwt').expect(204);
      expect(readCookies(unknown.headers['set-cookie']).refresh_token.value).toBe('');
    });

    it('is idempotent: a second logout with the same cookies is 204 too', async () => {
      const cookies = await signIn();
      await logout(`refresh_token=${cookies.refresh_token.value}`).expect(204);
      await logout(`refresh_token=${cookies.refresh_token.value}`).expect(204);
    });

    it('works while a temporary password must still be changed', async () => {
      await prisma.unscoped.user.update({
        where: { id: userId },
        data: { mustChangePassword: true },
      });
      try {
        const cookies = await signIn();
        await logout(
          `access_token=${cookies.access_token.value}`,
          `refresh_token=${cookies.refresh_token.value}`,
        ).expect(204);
        await refresh(`refresh_token=${cookies.refresh_token.value}`).expect(401);
      } finally {
        await prisma.unscoped.user.update({
          where: { id: userId },
          data: { mustChangePassword: false },
        });
      }
    });

    it('does not end another session of the same user', async () => {
      const mine = await signIn();
      const other = await signIn();
      await logout(`refresh_token=${mine.refresh_token.value}`).expect(204);
      await refresh(`refresh_token=${other.refresh_token.value}`).expect(204);
    });
  });

  describe('two refresh cookies with the same name', () => {
    it('uses the one that still works, whatever the order', async () => {
      const first = await signIn();
      const second = readCookies(
        (await refresh(`refresh_token=${first.refresh_token.value}`).expect(204)).headers[
          'set-cookie'
        ],
      );
      // `first` is used now (stale); `second` is the live one.
      const stale = `refresh_token=${first.refresh_token.value}`;
      const live = `refresh_token=${second.refresh_token.value}`;

      const third = await refresh(stale, live).expect(204);
      const rotated = readCookies(third.headers['set-cookie']);
      expect(rotated.refresh_token.value).not.toBe(second.refresh_token.value);
      // The session was not treated as stolen: the newest token works.
      const fourth = await refresh(`refresh_token=${rotated.refresh_token.value}`).expect(204);
      await refresh(
        `refresh_token=${readCookies(fourth.headers['set-cookie']).refresh_token.value}`,
        stale,
      ).expect(204);
    });

    it('still treats a replayed token as theft when none of them works', async () => {
      const first = await signIn();
      const second = readCookies(
        (await refresh(`refresh_token=${first.refresh_token.value}`).expect(204)).headers[
          'set-cookie'
        ],
      );
      await refresh(`refresh_token=${first.refresh_token.value}`).expect(401);
      await refresh(`refresh_token=${second.refresh_token.value}`).expect(401);
    });
  });

  describe('the absolute lifetime of 30 days', () => {
    it('stores the end of the session on every token and never moves it', async () => {
      const first = await signIn();
      current = new Date(START.getTime() + 5 * DAY);
      const second = readCookies(
        (await refresh(`refresh_token=${first.refresh_token.value}`).expect(204)).headers[
          'set-cookie'
        ],
      );
      current = new Date(START.getTime() + 10 * DAY);
      await refresh(`refresh_token=${second.refresh_token.value}`).expect(204);

      const family = await latestFamily();
      expect(family).toHaveLength(3);
      const end = new Date(START.getTime() + 30 * DAY);
      for (const token of family)
        expect(token.sessionExpiresAt.toISOString()).toBe(end.toISOString());
      // The idle expiry is still 7 days per token, from when it was issued.
      expect(family[0]?.expiresAt.toISOString()).toBe(
        new Date(START.getTime() + 7 * DAY).toISOString(),
      );
      expect(family[2]?.expiresAt.toISOString()).toBe(
        new Date(START.getTime() + 17 * DAY).toISOString(),
      );
    });

    it('works at day 29 when refreshed often enough, and a token never expires after day 30', async () => {
      let cookies = await signIn();
      // Every 6 days, inside the 7 days a token lives when it is not used.
      for (const day of [6, 12, 18, 24, 29]) {
        current = new Date(START.getTime() + day * DAY);
        const res = await refresh(`refresh_token=${cookies.refresh_token.value}`).expect(204);
        cookies = readCookies(res.headers['set-cookie']);
      }
      const last = (await latestFamily()).at(-1);
      // Day 29 + 7 days would be day 36; the token is cut at the session's end, day 30.
      expect(last?.expiresAt.toISOString()).toBe(
        new Date(START.getTime() + 30 * DAY).toISOString(),
      );
      expect(last?.sessionExpiresAt.toISOString()).toBe(last?.expiresAt.toISOString());

      current = new Date(START.getTime() + 30 * DAY + 1000);
      const res = await refresh(`refresh_token=${cookies.refresh_token.value}`).expect(401);
      expect(res.body).toMatchObject({ code: 'UNAUTHENTICATED' });
      // The expired refresh cookie is dropped from the browser, like any dead one.
      expect(readCookies(res.headers['set-cookie']).refresh_token.value).toBe('');
    });

    it('ends at day 30 even for a token issued the day before, and nobody can log back into it', async () => {
      let cookies = await signIn();
      for (const day of [6, 12, 18, 24, 29]) {
        current = new Date(START.getTime() + day * DAY);
        cookies = readCookies(
          (await refresh(`refresh_token=${cookies.refresh_token.value}`).expect(204)).headers[
            'set-cookie'
          ],
        );
      }
      // Issued one day ago, so its own 7 days are far from over: only the session's end refuses.
      current = new Date(START.getTime() + 30 * DAY);
      await refresh(`refresh_token=${cookies.refresh_token.value}`).expect(401);
      // A fresh login starts a new session of 30 days.
      const again = await signIn();
      await refresh(`refresh_token=${again.refresh_token.value}`).expect(204);
    });

    it('keeps the idle expiry of 7 days per token', async () => {
      const cookies = await signIn();
      current = new Date(START.getTime() + 7 * DAY + 1000);
      await refresh(`refresh_token=${cookies.refresh_token.value}`).expect(401);
    });
  });
});
