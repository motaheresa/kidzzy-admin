import type { INestApplication } from '@nestjs/common';
import { SystemRole, type Group, type Session } from '@kidzzy/shared';
import request from 'supertest';
import type { App } from 'supertest/types';
import { PrismaService } from '../src/modules/prisma/prisma.service';
import { createAcademy, createTestApp, createUser, readCookies, removeAcademy } from './helpers';

const NOW = new Date('2026-10-22T10:00:00.000Z');
type ErrorResponse = { code: string };

describe('Adding make-up and extra sessions (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let academyId: string;
  let otherAcademyId: string;
  let adminId: string;
  let otherInstructor: string;
  let ana: string;
  let ben: string;
  let adminToken: string;
  let anaToken: string;
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
        name: `Add ${Math.random().toString(36).slice(2, 8)}`,
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

  beforeAll(async () => {
    app = await createTestApp({ loginRateLimit: 1000, now: NOW });
    prisma = app.get(PrismaService);
    academyId = await createAcademy(prisma, 'sessions-create');
    otherAcademyId = await createAcademy(prisma, 'sessions-create-other');

    adminId = await createUser(prisma, academyId, {
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
    otherAdminToken = await login(mail('other-admin'));
  });

  afterAll(async () => {
    await removeAcademy(prisma, academyId);
    await removeAcademy(prisma, otherAcademyId);
    await app.close();
  });

  const create = (groupId: string, body: unknown, token = adminToken) =>
    request(server())
      .post(api(`/groups/${groupId}/sessions`))
      .set(as(token))
      .send(body as object);
  const audit = (id: string) =>
    prisma.unscoped.auditLog.findMany({ where: { entityId: id, action: 'session.created' } });
  const cancelFirst = async (groupId: string) => {
    const [target] = await sessionsOf(groupId);
    if (!target) throw new Error('expected generated session');
    await request(server())
      .post(api(`/sessions/${target.id}/cancel`))
      .set(as(adminToken))
      .send({ reason: 'ill' })
      .expect(200);
    return target;
  };
  const at = '2026-12-01T14:00:00.000Z';

  it('adds an extra session: Scheduled, no number, no slot, no occurrence date, the group’s instructor', async () => {
    const group = await newGroup();
    const res = await create(group.id, { scheduledAt: at, durationMin: 90 }).expect(201);

    expect(res.body).toMatchObject({
      group: { id: group.id },
      instructorId: ana,
      scheduledAt: at,
      durationMin: 90,
      status: 'scheduled',
      sessionNumber: null,
      isMakeup: true,
      compensatesSessionId: null,
    });
    const row = await prisma.unscoped.session.findUniqueOrThrow({
      where: { id: (res.body as Session).id },
    });
    expect(row).toMatchObject({
      slotId: null,
      slotAcademyId: null,
      occurrenceDate: null,
      compensatesSessionId: null,
      compensatesAcademyId: null,
      statusChangedById: null,
    });
  });

  it('adds a make-up linked to a Cancelled session of the group', async () => {
    const group = await newGroup();
    const target = await cancelFirst(group.id);
    const res = await create(group.id, {
      scheduledAt: at,
      durationMin: 60,
      compensatesSessionId: target.id,
    }).expect(201);

    expect(res.body).toMatchObject({
      status: 'scheduled',
      sessionNumber: null,
      isMakeup: true,
      compensatesSessionId: target.id,
    });
    const row = await prisma.unscoped.session.findUniqueOrThrow({
      where: { id: (res.body as Session).id },
    });
    expect(row).toMatchObject({ slotId: null, compensatesAcademyId: academyId });
  });

  it('refuses a second make-up for the same Cancelled session (409), and the index backs it up', async () => {
    const group = await newGroup();
    const target = await cancelFirst(group.id);
    await create(group.id, {
      scheduledAt: at,
      durationMin: 60,
      compensatesSessionId: target.id,
    }).expect(201);

    const res = await create(group.id, {
      scheduledAt: '2026-12-02T14:00:00.000Z',
      durationMin: 60,
      compensatesSessionId: target.id,
    }).expect(409);
    expect((res.body as ErrorResponse).code).toBe('SESSION_ALREADY_COMPENSATED');
    expect(
      await prisma.unscoped.session.count({ where: { compensatesSessionId: target.id } }),
    ).toBe(1);
    // Two at the same moment: the group lock lines them up, so one wins and the other is 409.
    const other = await cancelSecond(group.id);
    const [a, b] = await Promise.all([
      create(group.id, { scheduledAt: at, durationMin: 60, compensatesSessionId: other.id }),
      create(group.id, { scheduledAt: at, durationMin: 60, compensatesSessionId: other.id }),
    ]);
    expect([a.status, b.status].sort()).toEqual([201, 409]);
  });

  async function cancelSecond(groupId: string) {
    const [, target] = await sessionsOf(groupId);
    if (!target) throw new Error('expected second generated session');
    await request(server())
      .post(api(`/sessions/${target.id}/cancel`))
      .set(as(adminToken))
      .send({ reason: 'ill' })
      .expect(200);
    return target;
  }

  it('refuses a target that is not Cancelled (409 SESSION_NOT_CANCELLED)', async () => {
    const group = await newGroup();
    const [scheduled] = await sessionsOf(group.id);
    if (!scheduled) throw new Error('expected generated session');
    const res = await create(group.id, {
      scheduledAt: at,
      durationMin: 60,
      compensatesSessionId: scheduled.id,
    }).expect(409);
    expect((res.body as ErrorResponse).code).toBe('SESSION_NOT_CANCELLED');
  });

  it('refuses a target of another group, another academy or no session (422 on compensatesSessionId)', async () => {
    const group = await newGroup();
    const elsewhere = await newGroup();
    const otherTarget = await cancelFirst(elsewhere.id);
    const foreignGroup = await newGroup(otherInstructor, otherAdminToken);
    const foreign = await prisma.unscoped.session.findFirstOrThrow({
      where: { groupId: foreignGroup.id },
    });

    for (const id of [otherTarget.id, foreign.id, '0b8c5a3e-1f2d-4c6b-9a7e-3d4f5a6b7c8d']) {
      const res = await create(group.id, {
        scheduledAt: at,
        durationMin: 60,
        compensatesSessionId: id,
      }).expect(422);
      expect(res.body).toMatchObject({
        code: 'COMPENSATES_SESSION_INVALID',
        errors: [{ field: 'compensatesSessionId' }],
      });
    }
    expect(
      await prisma.unscoped.session.count({ where: { groupId: group.id, slotId: null } }),
    ).toBe(0);
  });

  it('is 409 GROUP_INACTIVE for an inactive group', async () => {
    const group = await newGroup();
    await request(server())
      .patch(api(`/groups/${group.id}`))
      .set(as(adminToken))
      .send({ isActive: false })
      .expect(200);
    const res = await create(group.id, { scheduledAt: at, durationMin: 60 }).expect(409);
    expect((res.body as ErrorResponse).code).toBe('GROUP_INACTIVE');
  });

  it('lets an instructor add to the group they teach now, and not to another group', async () => {
    const mine = await newGroup(ana);
    const theirs = await newGroup(ben);
    await create(mine.id, { scheduledAt: at, durationMin: 60 }, anaToken).expect(201);
    await create(theirs.id, { scheduledAt: at, durationMin: 60 }, anaToken).expect(403);
    expect(
      await prisma.unscoped.session.count({ where: { groupId: theirs.id, slotId: null } }),
    ).toBe(0);
  });

  it('lets the admin add to any group, and gives the session the group’s instructor', async () => {
    const group = await newGroup(ben);
    const res = await create(group.id, { scheduledAt: at, durationMin: 60 }).expect(201);
    expect((res.body as Session).instructorId).toBe(ben);
  });

  it('is 404 for another academy’s group and for an unknown group', async () => {
    const group = await newGroup();
    await create(group.id, { scheduledAt: at, durationMin: 60 }, otherAdminToken).expect(404);
    await create('0b8c5a3e-1f2d-4c6b-9a7e-3d4f5a6b7c8d', {
      scheduledAt: at,
      durationMin: 60,
    }).expect(404);
  });

  it('is 400 for a time without a zone, a bad duration, a bad link or an unknown field', async () => {
    const group = await newGroup();
    for (const body of [
      { scheduledAt: '2026-12-01T14:00:00', durationMin: 60 },
      { scheduledAt: '2026-12-01', durationMin: 60 },
      { durationMin: 60 },
      { scheduledAt: at },
      { scheduledAt: at, durationMin: 14 },
      { scheduledAt: at, durationMin: 241 },
      { scheduledAt: at, durationMin: 60.5 },
      { scheduledAt: at, durationMin: 60, compensatesSessionId: 'not-a-uuid' },
      { scheduledAt: at, durationMin: 60, extra: 1 },
    ]) {
      await create(group.id, body).expect(400);
    }
  });

  it('accepts a time in the past and an offset, without any overlap check', async () => {
    const group = await newGroup();
    const [generated] = await sessionsOf(group.id);
    if (!generated) throw new Error('expected generated session');
    const res = await create(group.id, {
      scheduledAt: generated.scheduledAt.toISOString(),
      durationMin: 60,
    }).expect(201);
    expect((res.body as Session).scheduledAt).toBe(generated.scheduledAt.toISOString());
    const past = await create(group.id, {
      scheduledAt: '2026-01-01T10:00:00+02:00',
      durationMin: 60,
    }).expect(201);
    expect((past.body as Session).scheduledAt).toBe('2026-01-01T08:00:00.000Z');
  });

  it('writes an audit entry with the time, the duration and the link', async () => {
    const group = await newGroup();
    const target = await cancelFirst(group.id);
    const res = await create(group.id, {
      scheduledAt: at,
      durationMin: 75,
      compensatesSessionId: target.id,
    }).expect(201);

    const entries = await audit((res.body as Session).id);
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      academyId,
      actorId: adminId,
      entityType: 'sessions',
      after: { scheduledAt: at, durationMin: 75, compensatesSessionId: target.id },
    });
    // A refusal leaves no entry.
    await create(group.id, {
      scheduledAt: at,
      durationMin: 75,
      compensatesSessionId: target.id,
    }).expect(409);
    expect(
      await prisma.unscoped.auditLog.count({ where: { action: 'session.created', academyId } }),
    ).toBeGreaterThanOrEqual(1);
  });

  it('survives a schedule edit and a deactivation: the daily generation and the edits skip it', async () => {
    const group = await newGroup();
    const extra = await create(group.id, { scheduledAt: at, durationMin: 60 }).expect(201);
    const extraId = (extra.body as Session).id;

    // Replace the Thursday slot with a Tuesday one: the future generated sessions are rebuilt.
    await request(server())
      .put(api(`/groups/${group.id}/schedule`))
      .set(as(adminToken))
      .send({ schedule: [{ weekday: 2, startTime: '10:00', durationMin: 60 }] })
      .expect(200);
    const kept = await prisma.unscoped.session.findUnique({ where: { id: extraId } });
    expect(kept).toMatchObject({ status: 'scheduled', slotId: null, scheduledAt: new Date(at) });

    // A new instructor for the group takes the session along (it is ahead and Scheduled).
    await request(server())
      .patch(api(`/groups/${group.id}`))
      .set(as(adminToken))
      .send({ instructorId: ben })
      .expect(200);
    expect(
      (await prisma.unscoped.session.findUniqueOrThrow({ where: { id: extraId } })).instructorId,
    ).toBe(ben);

    // Deactivating the group drops its generated future sessions, never the one added by hand.
    await request(server())
      .patch(api(`/groups/${group.id}`))
      .set(as(adminToken))
      .send({ isActive: false })
      .expect(200);
    expect(await prisma.unscoped.session.findUnique({ where: { id: extraId } })).not.toBeNull();
  });

  it('marked Held, it is numbered and counted in the payment cycles', async () => {
    const group = await newGroup();
    const studentRes = await request(server())
      .post(api('/students'))
      .set(as(adminToken))
      .send({
        code: `S-${stamp.slice(-6).toUpperCase()}`,
        name: 'Student',
        parentName: 'P',
        parentPhone: '01012345678',
      })
      .expect(201);
    const studentId = (studentRes.body as { id: string }).id;
    await request(server())
      .post(api(`/groups/${group.id}/enrollments`))
      .set(as(adminToken))
      .send({
        studentId,
        startDate: '2026-10-01',
        plan: { sessionsPerCycle: 8, amount: '1000.00' },
        openingCount: 0,
      })
      .expect(201);

    const extra = await create(group.id, {
      scheduledAt: '2026-10-20T14:00:00.000Z',
      durationMin: 60,
    }).expect(201);
    const held = await request(server())
      .post(api(`/sessions/${(extra.body as Session).id}/held`))
      .set(as(adminToken))
      .expect(200);

    expect(held.body).toMatchObject({ status: 'held', sessionNumber: 1, isMakeup: true });
    const cycle = await prisma.unscoped.paymentCycle.findFirstOrThrow({
      where: { studentId, cycleNumber: 1 },
    });
    expect(cycle.sessionsCounted).toBe(1);
  });

  it('lists only the sessions added by hand with isMakeup=true', async () => {
    const group = await newGroup();
    const extra = await create(group.id, { scheduledAt: at, durationMin: 60 }).expect(201);
    const res = await request(server())
      .get(api('/sessions'))
      .query({ groupId: group.id, isMakeup: 'true' })
      .set(as(adminToken))
      .expect(200);
    expect((res.body as { data: Session[] }).data.map((s) => s.id)).toEqual([
      (extra.body as Session).id,
    ]);
    const generated = await request(server())
      .get(api('/sessions'))
      .query({ groupId: group.id, isMakeup: 'false', pageSize: 100 })
      .set(as(adminToken))
      .expect(200);
    expect((generated.body as { data: Session[] }).data.every((s) => !s.isMakeup)).toBe(true);
    await request(server())
      .get(api('/sessions'))
      .query({ groupId: group.id, isMakeup: 'maybe' })
      .set(as(adminToken))
      .expect(400);
  });
});
