import type { INestApplication } from '@nestjs/common';
import { SystemRole, type Group, type Session } from '@kidzzy/shared';
import request from 'supertest';
import type { App } from 'supertest/types';
import { PrismaService } from '../src/modules/prisma/prisma.service';
import { createAcademy, createTestApp, createUser, readCookies, removeAcademy } from './helpers';

const NOW = new Date('2026-10-22T10:00:00.000Z');
type ErrorResponse = { code: string };

describe('Rescheduling sessions (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let academyId: string;
  let otherAcademyId: string;
  let ana: string;
  let ben: string;
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
        name: `Move ${Math.random().toString(36).slice(2, 8)}`,
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

  function move(id: string, scheduledAt: unknown, token = anaToken) {
    return request(server())
      .post(api(`/sessions/${id}/reschedule`))
      .set(as(token))
      .send({ scheduledAt });
  }

  const audit = (id: string) =>
    prisma.unscoped.auditLog.findMany({ where: { entityId: id, action: 'session.rescheduled' } });

  beforeAll(async () => {
    app = await createTestApp({ loginRateLimit: 1000, now: NOW });
    prisma = app.get(PrismaService);
    academyId = await createAcademy(prisma, 'sessions-reschedule');
    otherAcademyId = await createAcademy(prisma, 'sessions-reschedule-other');

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
    await createUser(prisma, otherAcademyId, {
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

  it('moves a session: it stays Scheduled, with no number, the same occurrence date and duration', async () => {
    const group = await newGroup();
    const [session] = await sessionsOf(group.id);
    if (!session) throw new Error('expected generated session');

    const res = await move(session.id, '2026-11-05T09:30:00.000Z').expect(200);
    expect(res.body).toMatchObject({
      id: session.id,
      status: 'scheduled',
      sessionNumber: null,
      scheduledAt: '2026-11-05T09:30:00.000Z',
      durationMin: session.durationMin,
    });
    const row = await prisma.unscoped.session.findUniqueOrThrow({ where: { id: session.id } });
    expect(row).toMatchObject({
      status: 'scheduled',
      sessionNumber: null,
      statusChangedById: null,
      statusChangedAt: null,
      occurrenceDate: session.occurrenceDate,
      durationMin: session.durationMin,
    });
  });

  it('accepts an offset and a time in the past, and stores the instant', async () => {
    const group = await newGroup();
    const [session] = await sessionsOf(group.id);
    if (!session) throw new Error('expected generated session');

    const res = await move(session.id, '2026-01-01T10:00:00+02:00').expect(200);
    expect((res.body as Session).scheduledAt).toBe('2026-01-01T08:00:00.000Z');
  });

  it('writes an audit entry with the time before and after', async () => {
    const group = await newGroup();
    const [session] = await sessionsOf(group.id);
    if (!session) throw new Error('expected generated session');
    await move(session.id, '2026-11-05T09:30:00.000Z').expect(200);

    const entries = await audit(session.id);
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      academyId,
      actorId: ana,
      entityType: 'sessions',
      before: { scheduledAt: session.scheduledAt.toISOString() },
      after: { scheduledAt: '2026-11-05T09:30:00.000Z' },
    });
  });

  it('refuses a Held and a Cancelled session (409 SESSION_NOT_SCHEDULED), changing nothing', async () => {
    const group = await newGroup();
    const [held, cancelled] = await sessionsOf(group.id);
    if (!held || !cancelled) throw new Error('expected two sessions');
    await setTime(held.id, '2026-09-01T08:00:00.000Z');
    await mark(held.id).expect(200);
    await request(server())
      .post(api(`/sessions/${cancelled.id}/cancel`))
      .set(as(anaToken))
      .send({ reason: 'ill' })
      .expect(200);

    for (const id of [held.id, cancelled.id]) {
      const res = await move(id, '2026-11-05T09:30:00.000Z').expect(409);
      expect((res.body as ErrorResponse).code).toBe('SESSION_NOT_SCHEDULED');
      expect(await audit(id)).toHaveLength(0);
    }
    const row = await prisma.unscoped.session.findUniqueOrThrow({ where: { id: held.id } });
    expect(row.scheduledAt.toISOString()).toBe('2026-09-01T08:00:00.000Z');
  });

  it('lets the admin move any session', async () => {
    const group = await newGroup();
    const [session] = await sessionsOf(group.id);
    if (!session) throw new Error('expected generated session');
    await move(session.id, '2026-11-05T09:30:00.000Z', adminToken).expect(200);
  });

  it('is 403 for another instructor, and for the former instructor of a future session', async () => {
    const group = await newGroup();
    const [session] = await sessionsOf(group.id);
    if (!session) throw new Error('expected generated session');
    await move(session.id, '2026-11-05T09:30:00.000Z', benToken).expect(403);

    // The group goes to Ben: its future Scheduled sessions go with it, so Ana is a former instructor.
    await request(server())
      .patch(api(`/groups/${group.id}`))
      .set(as(adminToken))
      .send({ instructorId: ben })
      .expect(200);
    await move(session.id, '2026-11-05T09:30:00.000Z', anaToken).expect(403);
    await move(session.id, '2026-11-05T09:30:00.000Z', benToken).expect(200);
    expect(await audit(session.id)).toHaveLength(1);
  });

  it('is 404 for another academy and for an unknown session', async () => {
    const group = await newGroup();
    const [session] = await sessionsOf(group.id);
    if (!session) throw new Error('expected generated session');
    await move(session.id, '2026-11-05T09:30:00.000Z', otherAdminToken).expect(404);
    await move('0b8c5a3e-1f2d-4c6b-9a7e-3d4f5a6b7c8d', '2026-11-05T09:30:00.000Z').expect(404);
  });

  it('is 400 for a missing, malformed or zone-less time, and for an unknown field', async () => {
    const group = await newGroup();
    const [session] = await sessionsOf(group.id);
    if (!session) throw new Error('expected generated session');
    for (const value of [
      undefined,
      null,
      '',
      'tomorrow',
      '2026-11-05',
      '2026-11-05T09:30:00',
      12345,
    ]) {
      await move(session.id, value).expect(400);
    }
    await request(server())
      .post(api(`/sessions/${session.id}/reschedule`))
      .set(as(anaToken))
      .send({ scheduledAt: '2026-11-05T09:30:00.000Z', extra: 1 })
      .expect(400);
    const row = await prisma.unscoped.session.findUniqueOrThrow({ where: { id: session.id } });
    expect(row.scheduledAt.toISOString()).toBe(session.scheduledAt.toISOString());
  });

  it('a reschedule and a Held at the same time: one wins, and the result is consistent', async () => {
    const group = await newGroup();
    const [session] = await sessionsOf(group.id);
    if (!session) throw new Error('expected generated session');
    await setTime(session.id, '2026-09-01T08:00:00.000Z');

    const [moved, held] = await Promise.all([
      move(session.id, '2026-09-02T08:00:00.000Z'),
      mark(session.id),
    ]);
    const row = await prisma.unscoped.session.findUniqueOrThrow({ where: { id: session.id } });
    // The group lock makes them run one after the other. Move first: Held succeeds too, on the
    // new time. Held first: the move is refused and the time is untouched.
    expect(held.status).toBe(200);
    expect(row.status).toBe('held');
    if (moved.status === 200) {
      expect(row.scheduledAt.toISOString()).toBe('2026-09-02T08:00:00.000Z');
      expect(await audit(session.id)).toHaveLength(1);
    } else {
      expect(moved.status).toBe(409);
      expect((moved.body as ErrorResponse).code).toBe('SESSION_NOT_SCHEDULED');
      expect(row.scheduledAt.toISOString()).toBe('2026-09-01T08:00:00.000Z');
      expect(await audit(session.id)).toHaveLength(0);
    }
  });
});
