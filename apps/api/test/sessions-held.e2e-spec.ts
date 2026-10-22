import type { INestApplication } from '@nestjs/common';
import { SystemRole, type Group, type HeldResult } from '@kidzzy/shared';
import request from 'supertest';
import type { App } from 'supertest/types';
import { PrismaService } from '../src/modules/prisma/prisma.service';
import { createAcademy, createTestApp, createUser, readCookies, removeAcademy } from './helpers';

const NOW = new Date('2026-10-22T10:00:00.000Z');
type HeldResponse = Pick<HeldResult, 'sessionNumber' | 'cyclesUpdated'>;
type ErrorResponse = { code: string };

describe('Marking sessions Held (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let academyId: string;
  let otherAcademyId: string;
  let ana: string;
  let ben: string;
  let otherInstructor: string;
  let adminToken: string;
  let anaToken: string;
  let benToken: string;
  let otherAdminToken: string;
  const password = 'correct-horse-1';
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  const mail = (name: string) => `${name}-${stamp}@test.local`;

  const server = () => app.getHttpServer();
  const api = (path: string) => `/api/v1${path}`;
  const as = (token: string) => ({ Cookie: `access_token=${token}` });

  async function login(loginName: string): Promise<string> {
    const res = await request(server())
      .post(api('/auth/login'))
      .send({ login: loginName, password })
      .expect(200);
    return readCookies(res.headers['set-cookie']).access_token.value;
  }

  async function newGroup(instructorId = ana, token = adminToken): Promise<Group> {
    const res = await request(server())
      .post(api('/groups'))
      .set(as(token))
      .send({
        name: `Held ${Math.random().toString(36).slice(2, 8)}`,
        level: 'Scratch 1',
        instructorId,
        startDate: '2026-10-01',
        schedule: [{ weekday: 4, startTime: '17:00', durationMin: 60 }],
      })
      .expect(201);
    return res.body as Group;
  }

  async function sessionsOf(groupId: string) {
    return prisma.unscoped.session.findMany({
      where: { groupId },
      orderBy: [{ scheduledAt: 'asc' }, { id: 'asc' }],
    });
  }

  async function setTime(id: string, scheduledAt: string) {
    return prisma.unscoped.session.update({
      where: { id },
      data: { scheduledAt: new Date(scheduledAt) },
    });
  }

  function mark(id: string, token = anaToken) {
    return request(server())
      .post(api(`/sessions/${id}/held`))
      .set(as(token));
  }

  beforeAll(async () => {
    app = await createTestApp({ loginRateLimit: 1000, now: NOW });
    prisma = app.get(PrismaService);
    academyId = await createAcademy(prisma, 'sessions-held');
    otherAcademyId = await createAcademy(prisma, 'sessions-held-other');

    await createUser(prisma, academyId, {
      name: 'admin',
      email: mail('admin'),
      password,
      role: SystemRole.Admin,
    });
    ana = await createUser(prisma, academyId, {
      name: 'ana',
      email: mail('ana'),
      password,
      role: SystemRole.Instructor,
    });
    ben = await createUser(prisma, academyId, {
      name: 'ben',
      email: mail('ben'),
      password,
      role: SystemRole.Instructor,
    });
    await createUser(prisma, otherAcademyId, {
      name: 'other-admin',
      email: mail('other-admin'),
      password,
      role: SystemRole.Admin,
    });
    otherInstructor = await createUser(prisma, otherAcademyId, {
      name: 'other-instructor',
      email: mail('other-instructor'),
      password,
      role: SystemRole.Instructor,
    });

    adminToken = await login(mail('admin'));
    anaToken = await login(mail('ana'));
    benToken = await login(mail('ben'));
    otherAdminToken = await login(mail('other-admin'));
  });

  afterAll(async () => {
    await removeAcademy(prisma, academyId);
    await removeAcademy(prisma, otherAcademyId);
    await app.close();
  });

  it('assigns the first Held session 1 and the next one 2', async () => {
    const group = await newGroup();
    const [first, second] = await sessionsOf(group.id);
    if (!first || !second) throw new Error('expected generated sessions');
    await setTime(first.id, '2026-10-20T08:00:00.000Z');
    await setTime(second.id, '2026-10-21T08:00:00.000Z');

    const firstResult = await mark(first.id).expect(200);
    expect(firstResult.body).toMatchObject({
      id: first.id,
      status: 'held',
      sessionNumber: 1,
      cyclesUpdated: [],
    });
    expect(firstResult.body).not.toHaveProperty('statusChangedAt');
    expect(firstResult.body).not.toHaveProperty('statusChangedById');

    const secondResult = await mark(second.id).expect(200);
    expect(secondResult.body).toMatchObject({
      id: second.id,
      status: 'held',
      sessionNumber: 2,
      cyclesUpdated: [],
    });

    const stored = await prisma.unscoped.session.findUniqueOrThrow({ where: { id: first.id } });
    expect(stored.statusChangedById).toBe(ana);
    expect(stored.statusChangedByAcademyId).toBe(academyId);
    expect(stored.statusChangedAt).toEqual(NOW);
  });

  it('does not number a Cancelled session between Held sessions', async () => {
    const group = await newGroup();
    const [first, cancelled, third] = await sessionsOf(group.id);
    if (!first || !cancelled || !third) throw new Error('expected generated sessions');
    await setTime(first.id, '2026-10-19T08:00:00.000Z');
    await prisma.unscoped.session.update({
      where: { id: cancelled.id },
      data: { status: 'cancelled', cancelReason: 'Instructor ill' },
    });
    await setTime(third.id, '2026-10-21T08:00:00.000Z');

    await mark(first.id)
      .expect(200)
      .then((res) => {
        expect((res.body as HeldResponse).sessionNumber).toBe(1);
      });
    const cancelledRow = await prisma.unscoped.session.findUniqueOrThrow({
      where: { id: cancelled.id },
    });
    expect(cancelledRow).toMatchObject({ status: 'cancelled', sessionNumber: null });
    await mark(third.id)
      .expect(200)
      .then((res) => {
        expect((res.body as HeldResponse).sessionNumber).toBe(2);
      });
  });

  it('blocks an instructor behind an earlier Scheduled session but lets an admin unlock it', async () => {
    const group = await newGroup();
    const [earlier, later] = await sessionsOf(group.id);
    if (!earlier || !later) throw new Error('expected generated sessions');
    await setTime(earlier.id, '2026-10-20T08:00:00.000Z');
    await setTime(later.id, '2026-10-21T08:00:00.000Z');

    await mark(later.id)
      .expect(409)
      .expect(({ body }) => {
        expect((body as ErrorResponse).code).toBe('SESSION_OUT_OF_ORDER');
      });
    await mark(later.id, adminToken)
      .expect(200)
      .expect(({ body }) => {
        expect((body as HeldResponse).sessionNumber).toBe(1);
      });
    const earlierRow = await prisma.unscoped.session.findUniqueOrThrow({
      where: { id: earlier.id },
    });
    expect(earlierRow).toMatchObject({ status: 'scheduled', sessionNumber: null });
  });

  it('refuses an earlier session when a later session is already Held', async () => {
    const group = await newGroup();
    const [earlier, later] = await sessionsOf(group.id);
    if (!earlier || !later) throw new Error('expected generated sessions');
    await setTime(earlier.id, '2026-10-20T08:00:00.000Z');
    await prisma.unscoped.session.update({
      where: { id: later.id },
      data: {
        scheduledAt: new Date('2026-10-21T08:00:00.000Z'),
        status: 'held',
        sessionNumber: 1,
      },
    });

    await mark(earlier.id, adminToken)
      .expect(409)
      .expect(({ body }) => {
        expect((body as ErrorResponse).code).toBe('SESSION_OUT_OF_ORDER');
      });
  });

  it('refuses a session whose scheduled time is still in the future', async () => {
    const group = await newGroup();
    const [future] = await sessionsOf(group.id);
    if (!future) throw new Error('expected generated session');

    await mark(future.id, adminToken)
      .expect(409)
      .expect(({ body }) => {
        expect((body as ErrorResponse).code).toBe('SESSION_NOT_STARTED');
      });
  });

  it('refuses to mark the same session Held twice', async () => {
    const group = await newGroup();
    const [session] = await sessionsOf(group.id);
    if (!session) throw new Error('expected generated session');
    await setTime(session.id, '2026-10-21T08:00:00.000Z');

    await mark(session.id).expect(200);
    await mark(session.id)
      .expect(409)
      .expect(({ body }) => {
        expect((body as ErrorResponse).code).toBe('SESSION_NOT_SCHEDULED');
      });
  });

  it('serializes concurrent requests for the same session', async () => {
    const group = await newGroup();
    const [session] = await sessionsOf(group.id);
    if (!session) throw new Error('expected generated session');
    await setTime(session.id, '2026-10-21T08:00:00.000Z');

    const results = await Promise.all([mark(session.id, adminToken), mark(session.id, adminToken)]);
    expect(results.map((result) => result.status).sort()).toEqual([200, 409]);
    expect((results.find((result) => result.status === 409)?.body as ErrorResponse).code).toBe(
      'SESSION_NOT_SCHEDULED',
    );
    const stored = await prisma.unscoped.session.findUniqueOrThrow({ where: { id: session.id } });
    expect(stored.sessionNumber).toBe(1);
  });

  it('does not let an earlier Scheduled session in another group block a hold', async () => {
    const otherGroup = await newGroup();
    const targetGroup = await newGroup();
    const [unrelated] = await sessionsOf(otherGroup.id);
    const [target] = await sessionsOf(targetGroup.id);
    if (!unrelated || !target) throw new Error('expected generated sessions');
    await setTime(unrelated.id, '2026-10-20T08:00:00.000Z');
    await setTime(target.id, '2026-10-21T08:00:00.000Z');

    await mark(target.id)
      .expect(200)
      .expect(({ body }) => {
        expect((body as HeldResponse).sessionNumber).toBe(1);
      });
    await mark(unrelated.id)
      .expect(200)
      .expect(({ body }) => {
        expect((body as HeldResponse).sessionNumber).toBe(1);
      });
  });

  it('allows two sessions at the same scheduled time', async () => {
    const group = await newGroup();
    const [first, second] = await sessionsOf(group.id);
    if (!first || !second) throw new Error('expected generated sessions');
    await setTime(first.id, '2026-10-21T08:00:00.000Z');
    await setTime(second.id, '2026-10-21T08:00:00.000Z');

    await mark(first.id).expect(200);
    await mark(second.id)
      .expect(200)
      .expect(({ body }) => {
        expect((body as HeldResponse).sessionNumber).toBe(2);
      });
  });

  it('allows the session instructor and forbids another instructor', async () => {
    const group = await newGroup();
    const [session] = await sessionsOf(group.id);
    if (!session) throw new Error('expected generated session');
    await setTime(session.id, '2026-10-21T08:00:00.000Z');

    await mark(session.id, benToken).expect(403);
    await mark(session.id, anaToken).expect(200);
  });

  it('keeps write scope tied to the session instructor after the group instructor changes', async () => {
    const group = await newGroup();
    const [future, old] = await sessionsOf(group.id);
    if (!future || !old) throw new Error('expected generated sessions');
    await setTime(old.id, '2026-10-20T08:00:00.000Z');

    await request(server())
      .patch(api(`/groups/${group.id}`))
      .set(as(adminToken))
      .send({ instructorId: ben })
      .expect(200);

    const reassigned = await prisma.unscoped.session.findUniqueOrThrow({
      where: { id: future.id },
    });
    const past = await prisma.unscoped.session.findUniqueOrThrow({ where: { id: old.id } });
    expect(reassigned.instructorId).toBe(ben);
    expect(past.instructorId).toBe(ana);
    await mark(future.id, anaToken).expect(403);
    await mark(old.id, benToken).expect(403);
  });

  it('returns 404 for a session in another academy', async () => {
    const group = await newGroup(otherInstructor, otherAdminToken);
    const [session] = await sessionsOf(group.id);
    if (!session) throw new Error('expected generated session');

    await mark(session.id, anaToken).expect(404);
  });

  it('serializes overlapping holds of different sessions in one group', async () => {
    const group = await newGroup();
    const [first, second] = await sessionsOf(group.id);
    if (!first || !second) throw new Error('expected generated sessions');
    const sameTime = '2026-10-21T08:00:00.000Z';
    await setTime(first.id, sameTime);
    await setTime(second.id, sameTime);

    const results = await Promise.all([mark(first.id), mark(second.id)]);
    expect(results.map((result) => result.status)).toEqual([200, 200]);
    expect(results.map((result) => (result.body as HeldResponse).sessionNumber).sort()).toEqual([
      1, 2,
    ]);
    expect(
      results.every((result) => (result.body as HeldResponse).cyclesUpdated.length === 0),
    ).toBe(true);

    const stored = await prisma.unscoped.session.findMany({
      where: { id: { in: [first.id, second.id] } },
    });
    expect(stored).toHaveLength(2);
    expect(stored.every((row) => row.statusChangedById === ana)).toBe(true);
    expect(stored.every((row) => row.statusChangedByAcademyId === academyId)).toBe(true);
    expect(stored.every((row) => row.statusChangedAt?.getTime() === NOW.getTime())).toBe(true);
  });
});
