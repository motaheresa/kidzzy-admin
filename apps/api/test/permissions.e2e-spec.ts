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
import { AccessTestController } from './support/access-test.controller';

// The authorization mechanism (SCRUM-15, ADR-0013): PermissionsGuard + AccessContext, through a
// test-only controller. AC-08 itself is proven in the first groups story.

describe('Permissions (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let academyId: string;
  let adminId: string;
  let instructorId: string;
  const password = 'correct-horse-1';
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  const adminEmail = `perm-admin-${stamp}@test.local`;
  const instructorEmail = `perm-instructor-${stamp}@test.local`;

  const server = () => app.getHttpServer();
  async function signIn(login: string) {
    const res = await request(server())
      .post('/api/v1/auth/login')
      .send({ login, password })
      .expect(200);
    return readCookies(res.headers['set-cookie']);
  }
  const get = (path: string, accessToken: string) =>
    request(server()).get(`/api/v1${path}`).set('Cookie', `access_token=${accessToken}`);
  const refresh = (refreshToken: string) =>
    request(server()).post('/api/v1/auth/refresh').set('Cookie', `refresh_token=${refreshToken}`);

  beforeAll(async () => {
    app = await createTestApp({ loginRateLimit: 1000, extraControllers: [AccessTestController] });
    prisma = app.get(PrismaService);
    academyId = await createAcademy(prisma, 'permissions');
    adminId = await createUser(prisma, academyId, {
      name: 'Admin',
      email: adminEmail,
      password,
      role: SystemRole.Admin,
    });
    instructorId = await createUser(prisma, academyId, {
      name: 'Instructor',
      email: instructorEmail,
      password,
      role: SystemRole.Instructor,
    });
  });

  afterAll(async () => {
    await removeAcademy(prisma, academyId);
    await app.close();
  });

  it('gives the admin scope any, and the instructor scope own', async () => {
    const admin = await signIn(adminEmail);
    const instructor = await signIn(instructorEmail);
    expect((await get('/__test/access/groups', admin.access_token.value).expect(200)).body).toEqual(
      {
        scope: 'any',
      },
    );
    expect(
      (await get('/__test/access/groups', instructor.access_token.value).expect(200)).body,
    ).toEqual({ scope: 'own' });
  });

  it('answers 403 FORBIDDEN (Problem Details) for a permission the role lacks', async () => {
    const instructor = await signIn(instructorEmail);
    const res = await get('/__test/access/payments-manage', instructor.access_token.value).expect(
      403,
    );
    expect(res.headers['content-type']).toMatch(/application\/problem\+json/);
    expect(res.body).toMatchObject({ status: 403, code: 'FORBIDDEN' });
    const admin = await signIn(adminEmail);
    await get('/__test/access/payments-manage', admin.access_token.value).expect(200);
  });

  it('with scope own, lets the instructor read their own record and refuses another’s (403, not 404)', async () => {
    const instructor = await signIn(instructorEmail);
    await get(`/__test/access/groups/${instructorId}`, instructor.access_token.value).expect(200);
    const res = await get(`/__test/access/groups/${adminId}`, instructor.access_token.value).expect(
      403,
    );
    expect(res.body).toMatchObject({ code: 'FORBIDDEN' });
    // scope any reads every record
    const admin = await signIn(adminEmail);
    await get(`/__test/access/groups/${instructorId}`, admin.access_token.value).expect(200);
  });

  it('keeps a removed permission until the next refresh, then refuses it', async () => {
    const instructor = await signIn(instructorEmail);
    await prisma.unscoped.rolePermission.deleteMany({
      where: {
        role: { academyId, name: SystemRole.Instructor },
        permission: { key: 'groups.read:own' },
      },
    });

    // The access token still carries the old keys (no database query in the guard)...
    await get('/__test/access/groups', instructor.access_token.value).expect(200);
    // ...and the refresh puts the current ones into the new token.
    const refreshed = readCookies(
      (await refresh(instructor.refresh_token.value).expect(204)).headers['set-cookie'],
    );
    const res = await get('/__test/access/groups', refreshed.access_token.value).expect(403);
    expect(res.body).toMatchObject({ code: 'FORBIDDEN' });
  });

  it('signs a deactivated user out at /auth/me and at the refresh (401)', async () => {
    const email = `perm-gone-${stamp}@test.local`;
    const userId = await createUser(prisma, academyId, {
      name: 'Soon gone',
      email,
      password,
      role: SystemRole.Admin,
    });
    const cookies = await signIn(email);
    await prisma.unscoped.user.update({ where: { id: userId }, data: { isActive: false } });

    // Within the access token's 15 minutes the guard still lets it through (ADR-0013)...
    await get('/__test/access/groups', cookies.access_token.value).expect(200);
    // ...but /auth/me refuses at once, and the refresh ends the session.
    expect((await get('/auth/me', cookies.access_token.value).expect(401)).body).toMatchObject({
      code: 'UNAUTHENTICATED',
    });
    await refresh(cookies.refresh_token.value).expect(401);
  });

  it('refuses a token signed by us but without the permission keys (401)', async () => {
    const secret = app.get(ConfigService).getOrThrow<string>('JWT_ACCESS_SECRET');
    const now = Math.floor(Date.now() / 1000);
    const token = signTestJwt(
      { sub: adminId, aid: academyId, sid: randomUUID(), exp: now + 60 },
      secret,
    );
    expect((await get('/__test/access/groups', token).expect(401)).body).toMatchObject({
      code: 'UNAUTHENTICATED',
    });
  });

  it('keeps the admin’s access cookie well under the 4 KB cookie limit', async () => {
    const res = await request(server())
      .post('/api/v1/auth/login')
      .send({ login: adminEmail, password })
      .expect(200);
    const setCookie = ([] as string[])
      .concat(res.headers['set-cookie'] ?? [])
      .find((c) => c.startsWith('access_token='));
    expect(setCookie).toBeDefined();
    expect(setCookie!.length).toBeLessThan(2048);
  });

  it('never exposes the test-only controller in an app built without it', async () => {
    const plain = await createTestApp();
    const admin = readCookies(
      (
        await request(plain.getHttpServer())
          .post('/api/v1/auth/login')
          .send({ login: adminEmail, password })
          .expect(200)
      ).headers['set-cookie'],
    );
    await request(plain.getHttpServer())
      .get('/api/v1/__test/access/groups')
      .set('Cookie', `access_token=${admin.access_token.value}`)
      .expect(404);
    await plain.close();
  });
});
