import type { INestApplication } from '@nestjs/common';
import { SystemRole, type Group, type HeldResult, type Session } from '@kidzzy/shared';
import request from 'supertest';
import type { App } from 'supertest/types';
import { PrismaService } from '../src/modules/prisma/prisma.service';
import { createAcademy, createTestApp, createUser, readCookies, removeAcademy } from './helpers';

const NOW = new Date('2026-10-22T10:00:00.000Z');
type HeldResponse = Pick<HeldResult, 'sessionNumber'>;
type ErrorResponse = { code: string };

describe('Cancelling sessions (e2e)', () => {
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
        name: `Cancel ${Math.random().toString(36).slice(2, 8)}`,
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

  function cancelWith(id: string, body: object, token = anaToken) {
    return request(server())
      .post(api(`/sessions/${id}/cancel`))
      .set(as(token))
      .send(body);
  }

  function cancel(id: string, reason = 'Instructor ill', token = anaToken) {
    return cancelWith(id, { reason }, token);
  }

  beforeAll(async () => {
    app = await createTestApp({ loginRateLimit: 1000, now: NOW });
    prisma = app.get(PrismaService);
    academyId = await createAcademy(prisma, 'sessions-cancel');
    otherAcademyId = await createAcademy(prisma, 'sessions-cancel-other');

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

  it('cancels a session with a trimmed reason and no number, and records who changed it', async () => {
    const group = await newGroup();
    const [session] = await sessionsOf(group.id);
    if (!session) throw new Error('expected generated session');

    const res = await cancel(session.id, '  Instructor ill  ').expect(200);
    expect(res.body).toMatchObject({
      id: session.id,
      status: 'cancelled',
      sessionNumber: null,
      cancelReason: 'Instructor ill',
    });
    expect(res.body).not.toHaveProperty('statusChangedAt');
    expect(res.body).not.toHaveProperty('statusChangedById');

    const stored = await prisma.unscoped.session.findUniqueOrThrow({ where: { id: session.id } });
    expect(stored.statusChangedById).toBe(ana);
    expect(stored.statusChangedByAcademyId).toBe(academyId);
    expect(stored.statusChangedAt).toEqual(NOW);
  });

  it.each([
    ['missing', undefined],
    ['empty', ''],
    ['only spaces', '   '],
    ['too long', 'x'.repeat(501)],
    ['not text', 5],
  ])('refuses a %s reason', async (_label, reason) => {
    const group = await newGroup();
    const [session] = await sessionsOf(group.id);
    if (!session) throw new Error('expected generated session');

    await cancelWith(session.id, reason === undefined ? {} : { reason })
      .expect(400)
      .expect(({ body }) => {
        expect((body as ErrorResponse).code).toBe('VALIDATION_FAILED');
      });
    const stored = await prisma.unscoped.session.findUniqueOrThrow({ where: { id: session.id } });
    expect(stored.status).toBe('scheduled');
  });

  it('unblocks the sessions after it, and the next Held continues the numbers', async () => {
    const group = await newGroup();
    const [missed, next, last] = await sessionsOf(group.id);
    if (!missed || !next || !last) throw new Error('expected generated sessions');
    await setTime(missed.id, '2026-10-19T08:00:00.000Z');
    await setTime(next.id, '2026-10-20T08:00:00.000Z');
    await setTime(last.id, '2026-10-21T08:00:00.000Z');

    await mark(next.id)
      .expect(409)
      .expect(({ body }) => {
        expect((body as ErrorResponse).code).toBe('SESSION_OUT_OF_ORDER');
      });
    await cancel(missed.id).expect(200);
    await mark(next.id)
      .expect(200)
      .expect(({ body }) => {
        expect((body as HeldResponse).sessionNumber).toBe(1);
      });
    await mark(last.id)
      .expect(200)
      .expect(({ body }) => {
        expect((body as HeldResponse).sessionNumber).toBe(2);
      });
    const cancelled = await prisma.unscoped.session.findUniqueOrThrow({
      where: { id: missed.id },
    });
    expect(cancelled).toMatchObject({ status: 'cancelled', sessionNumber: null });
  });

  it('can cancel a session that has not started yet', async () => {
    const group = await newGroup();
    const [session] = await sessionsOf(group.id);
    if (!session) throw new Error('expected generated session');
    await setTime(session.id, '2026-12-01T08:00:00.000Z');

    await cancel(session.id).expect(200);
  });

  it('refuses a session that is not Scheduled', async () => {
    const group = await newGroup();
    const [cancelledTwice, held] = await sessionsOf(group.id);
    if (!cancelledTwice || !held) throw new Error('expected generated sessions');
    await setTime(held.id, '2026-10-21T08:00:00.000Z');

    await cancel(cancelledTwice.id).expect(200);
    await cancel(cancelledTwice.id)
      .expect(409)
      .expect(({ body }) => {
        expect((body as ErrorResponse).code).toBe('SESSION_NOT_SCHEDULED');
      });
    await mark(held.id).expect(200);
    await cancel(held.id)
      .expect(409)
      .expect(({ body }) => {
        expect((body as ErrorResponse).code).toBe('SESSION_NOT_SCHEDULED');
      });
    const stored = await prisma.unscoped.session.findUniqueOrThrow({ where: { id: held.id } });
    expect(stored).toMatchObject({ status: 'held', sessionNumber: 1, cancelReason: null });
  });

  it('lets the admin cancel any session of the academy', async () => {
    const group = await newGroup();
    const [session] = await sessionsOf(group.id);
    if (!session) throw new Error('expected generated session');

    const res = await cancel(session.id, 'Holiday', adminToken).expect(200);
    expect((res.body as Session).status).toBe('cancelled');
  });

  it('allows the session instructor and forbids another instructor', async () => {
    const group = await newGroup();
    const [session] = await sessionsOf(group.id);
    if (!session) throw new Error('expected generated session');

    await cancel(session.id, 'Instructor ill', benToken).expect(403);
    const untouched = await prisma.unscoped.session.findUniqueOrThrow({
      where: { id: session.id },
    });
    expect(untouched.status).toBe('scheduled');
    await cancel(session.id).expect(200);
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

    await cancel(future.id, 'Holiday', anaToken).expect(403);
    await cancel(old.id, 'Holiday', benToken).expect(403);
    await cancel(future.id, 'Holiday', benToken).expect(200);
  });

  it('returns 404 for a session in another academy and for an unknown one', async () => {
    const group = await newGroup(otherInstructor, otherAdminToken);
    const [session] = await sessionsOf(group.id);
    if (!session) throw new Error('expected generated session');

    await cancel(session.id).expect(404);
    await cancel('0b8c5a3e-1f2d-4c6b-9a7e-3d4f5a6b7c8d').expect(404);
  });

  it('lets only one of a cancel and a Held mark of the same session win', async () => {
    const group = await newGroup();
    const [session] = await sessionsOf(group.id);
    if (!session) throw new Error('expected generated session');
    await setTime(session.id, '2026-10-21T08:00:00.000Z');

    const [cancelled, held] = await Promise.all([cancel(session.id), mark(session.id)]);
    expect([cancelled.status, held.status].sort()).toEqual([200, 409]);
    const stored = await prisma.unscoped.session.findUniqueOrThrow({ where: { id: session.id } });
    if (stored.status === 'cancelled') expect(stored.sessionNumber).toBeNull();
    else expect(stored).toMatchObject({ status: 'held', sessionNumber: 1, cancelReason: null });
  });
});
