import type { INestApplication } from '@nestjs/common';
import { SystemRole, type Group, type Session } from '@kidzzy/shared';
import request from 'supertest';
import type { App } from 'supertest/types';
import { PrismaService } from '../src/modules/prisma/prisma.service';
import { createAcademy, createTestApp, createUser, readCookies, removeAcademy } from './helpers';

// US-12 (SCRUM-24): list and read sessions. "Now" is Thursday 2026-10-22 at 13:00 in Cairo
// (UTC+3), so a Thursday 17:00 group has a session today at 14:00 UTC.

const NOW = new Date('2026-10-22T10:00:00.000Z');
const TODAY_FROM = '2026-10-21T21:00:00.000Z';
const TODAY_TO = '2026-10-22T21:00:00.000Z';

describe('Reading sessions (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let academyId: string;
  let otherAcademyId: string;
  let ana: string;
  let bassem: string;
  let adminToken: string;
  let anaToken: string;
  let bassemToken: string;
  let noorToken: string;
  let otherToken: string;
  let groupId: string;
  let todayId: string;
  let otherSessionId: string;
  let otherInstructor: string;
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

  beforeAll(async () => {
    app = await createTestApp({ loginRateLimit: 1000, now: NOW });
    prisma = app.get(PrismaService);
    academyId = await createAcademy(prisma, 'sessions-read');
    otherAcademyId = await createAcademy(prisma, 'sessions-read-other');

    await createUser(prisma, academyId, {
      name: 'Admin',
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
    bassem = await createUser(prisma, academyId, {
      name: 'bassem',
      email: mail('bassem'),
      password,
      role: SystemRole.Instructor,
    });
    await createUser(prisma, academyId, {
      name: 'noor',
      email: mail('noor'),
      password,
      role: SystemRole.Instructor,
    });
    await createUser(prisma, otherAcademyId, {
      name: 'Other',
      email: mail('other'),
      password,
      role: SystemRole.Admin,
    });

    otherInstructor = await createUser(prisma, otherAcademyId, {
      name: 'Other Ana',
      email: mail('other-ana'),
      password,
      role: SystemRole.Instructor,
    });

    adminToken = await login(mail('admin'));
    anaToken = await login(mail('ana'));
    bassemToken = await login(mail('bassem'));
    noorToken = await login(mail('noor'));
    otherToken = await login(mail('other'));

    const created = await request(server())
      .post(api('/groups'))
      .set(as(adminToken))
      .send({
        name: 'Group Thursday',
        level: 'Scratch 1',
        instructorId: ana,
        startDate: '2026-10-01',
        schedule: [{ weekday: 4, startTime: '17:00', durationMin: 60 }],
      })
      .expect(201);
    groupId = (created.body as Group).id;

    const rows = await prisma.unscoped.session.findMany({
      where: { groupId },
      orderBy: { scheduledAt: 'asc' },
    });
    expect(rows.length).toBeGreaterThan(1);
    const first = rows[0];
    const later = rows[1];
    if (!first || !later) throw new Error('expected generated sessions');
    todayId = first.id;
    // A later session is already held, so the list can filter by status before US-13 exists.
    await prisma.unscoped.session.update({
      where: { id: later.id },
      data: { status: 'held', sessionNumber: 1 },
    });

    const otherGroup = await request(server())
      .post(api('/groups'))
      .set(as(otherToken))
      .send({
        name: 'Other Thursday',
        level: 'Scratch 1',
        instructorId: otherInstructor,
        startDate: '2026-10-01',
        schedule: [{ weekday: 4, startTime: '17:00', durationMin: 60 }],
      })
      .expect(201);
    otherSessionId = (
      await prisma.unscoped.session.findFirstOrThrow({
        where: { groupId: (otherGroup.body as Group).id },
        orderBy: { scheduledAt: 'asc' },
      })
    ).id;
  });

  afterAll(async () => {
    await removeAcademy(prisma, academyId);
    await removeAcademy(prisma, otherAcademyId);
    await app.close();
  });

  function expectSession(body: Session) {
    expect(body).toEqual({
      id: todayId,
      group: { id: groupId, name: 'Group Thursday' },
      instructorId: ana,
      instructorName: 'ana',
      scheduledAt: '2026-10-22T14:00:00.000Z',
      durationMin: 60,
      status: 'scheduled',
      sessionNumber: null,
      isMakeup: false,
      compensatesSessionId: null,
      cancelReason: null,
    });
  }

  it('returns one session and only the Session fields', async () => {
    const res = await request(server())
      .get(api(`/sessions/${todayId}`))
      .set(as(adminToken))
      .expect(200);
    expectSession(res.body as Session);
    expect(Object.keys(res.body as object).sort()).toEqual(
      [
        'cancelReason',
        'compensatesSessionId',
        'durationMin',
        'group',
        'id',
        'instructorId',
        'instructorName',
        'isMakeup',
        'scheduledAt',
        'sessionNumber',
        'status',
      ].sort(),
    );
    expect(Object.keys((res.body as Session).group).sort()).toEqual(['id', 'name']);
  });

  function listed(res: { body: unknown }): Session[] {
    return (res.body as { data: Session[] }).data;
  }

  it("lists today's window only, earliest first, from inclusive and to exclusive", async () => {
    const today = await request(server())
      .get(api('/sessions'))
      .query({ from: TODAY_FROM, to: TODAY_TO })
      .set(as(adminToken))
      .expect(200);
    expect(listed(today).map((row) => row.id)).toEqual([todayId]);

    const atStart = await request(server())
      .get(api('/sessions'))
      .query({ from: '2026-10-22T14:00:00.000Z', to: '2026-10-22T14:00:00.001Z' })
      .set(as(adminToken))
      .expect(200);
    expect(listed(atStart)).toHaveLength(1);

    const endsAtSession = await request(server())
      .get(api('/sessions'))
      .query({ from: '2026-10-22T13:00:00.000Z', to: '2026-10-22T14:00:00.000Z' })
      .set(as(adminToken))
      .expect(200);
    expect(listed(endsAtSession)).toHaveLength(0);
  });

  it('filters by group and status, and pages', async () => {
    const held = await request(server())
      .get(api('/sessions'))
      .query({ groupId, status: 'held' })
      .set(as(adminToken))
      .expect(200);
    const heldRows = listed(held);
    expect(heldRows).toHaveLength(1);
    expect(heldRows[0]?.sessionNumber).toBe(1);
    expect(heldRows[0]?.status).toBe('held');

    const page = await request(server())
      .get(api('/sessions'))
      .query({ groupId, page: 1, pageSize: 1 })
      .set(as(adminToken))
      .expect(200);
    const firstPage = listed(page);
    expect(firstPage).toHaveLength(1);
    expect((page.body as { meta: { total: number } }).meta.total).toBeGreaterThan(1);
    const second = await request(server())
      .get(api('/sessions'))
      .query({ groupId, page: 2, pageSize: 1 })
      .set(as(adminToken))
      .expect(200);
    const secondPage = listed(second);
    const earlier = firstPage[0];
    const later = secondPage[0];
    if (!earlier || !later) throw new Error('expected a session on each page');
    expect(earlier.scheduledAt < later.scheduledAt).toBe(true);
  });

  it('gives an instructor their own groups and refuses another instructor', async () => {
    const own = await request(server()).get(api('/sessions')).set(as(anaToken)).expect(200);
    const ownRows = listed(own);
    expect(ownRows.every((row) => row.group.id === groupId)).toBe(true);
    expect(ownRows.length).toBeGreaterThan(0);

    const none = await request(server()).get(api('/sessions')).set(as(bassemToken)).expect(200);
    expect(listed(none)).toEqual([]);

    await request(server())
      .get(api(`/sessions/${todayId}`))
      .set(as(anaToken))
      .expect(200);
    await request(server())
      .get(api(`/sessions/${todayId}`))
      .set(as(bassemToken))
      .expect(403);

    await request(server())
      .get(api('/sessions'))
      .query({ groupId })
      .set(as(bassemToken))
      .expect(403);
    await request(server())
      .get(api('/sessions'))
      .query({ instructorId: ana })
      .set(as(bassemToken))
      .expect(403);
  });

  it('answers 404 for another academy and an unknown group, and an empty list for an unknown instructor', async () => {
    await request(server())
      .get(api(`/sessions/${otherSessionId}`))
      .set(as(adminToken))
      .expect(404);
    await request(server())
      .get(api('/sessions'))
      .query({ groupId: otherSessionId })
      .set(as(adminToken))
      .expect(404);
    await request(server())
      .get(api('/sessions'))
      .query({ instructorId: otherSessionId })
      .set(as(adminToken))
      .expect(200)
      .expect((res) => expect(listed(res)).toEqual([]));
  });

  it('rejects a reversed range and an unknown sort', async () => {
    await request(server())
      .get(api('/sessions'))
      .query({ from: TODAY_TO, to: TODAY_FROM })
      .set(as(adminToken))
      .expect(400)
      .expect((res) => expect((res.body as { code: string }).code).toBe('VALIDATION_FAILED'));
    await request(server())
      .get(api('/sessions'))
      .query({ sort: 'name' })
      .set(as(adminToken))
      .expect(400);
  });

  it('after an instructor change, each instructor sees the sessions the OR rule gives them', async () => {
    const created = await request(server())
      .post(api('/groups'))
      .set(as(adminToken))
      .send({
        name: 'Group Reassigned',
        level: 'Scratch 1',
        instructorId: ana,
        startDate: '2026-10-01',
        schedule: [{ weekday: 4, startTime: '17:00', durationMin: 60 }],
      })
      .expect(201);
    const reassignedId = (created.body as Group).id;
    const before = await prisma.unscoped.session.findMany({
      where: { groupId: reassignedId },
      orderBy: { scheduledAt: 'asc' },
    });
    expect(before.length).toBeGreaterThan(1);
    const past = before[0];
    if (!past) throw new Error('expected a generated session');
    // Generation only creates sessions still ahead of the fixed clock, so this row is moved
    // before "now" to stand for a session that was already taught.
    await prisma.unscoped.session.update({
      where: { id: past.id },
      data: { scheduledAt: new Date('2026-10-15T14:00:00.000Z') },
    });

    await request(server())
      .patch(api(`/groups/${reassignedId}`))
      .set(as(adminToken))
      .send({ instructorId: bassem })
      .expect(200);

    const after = await prisma.unscoped.session.findMany({
      where: { groupId: reassignedId },
      orderBy: { scheduledAt: 'asc' },
    });
    const pastRow = after.find((row) => row.id === past.id);
    const future = after.filter((row) => row.id !== past.id);
    expect(pastRow?.instructorId).toBe(ana);
    expect(future.length).toBeGreaterThan(0);
    expect(future.every((row) => row.instructorId === bassem)).toBe(true);
    const futureId = future[0]?.id;
    if (!futureId) throw new Error('expected a future session');

    const anaGroup = await request(server())
      .get(api('/sessions'))
      .query({ groupId: reassignedId, pageSize: 100 })
      .set(as(anaToken))
      .expect(200);
    expect(listed(anaGroup).map((row) => row.id)).toEqual([past.id]);
    await request(server())
      .get(api(`/sessions/${past.id}`))
      .set(as(anaToken))
      .expect(200);
    await request(server())
      .get(api(`/sessions/${futureId}`))
      .set(as(anaToken))
      .expect(403);

    const bassemGroup = await request(server())
      .get(api('/sessions'))
      .query({ groupId: reassignedId, pageSize: 100 })
      .set(as(bassemToken))
      .expect(200);
    expect(
      listed(bassemGroup)
        .map((row) => row.id)
        .sort(),
    ).toEqual(after.map((row) => row.id).sort());
    await request(server())
      .get(api(`/sessions/${past.id}`))
      .set(as(bassemToken))
      .expect(200);
    await request(server())
      .get(api(`/sessions/${futureId}`))
      .set(as(bassemToken))
      .expect(200);

    await request(server())
      .get(api(`/sessions/${futureId}`))
      .set(as(noorToken))
      .expect(403);
    await request(server())
      .get(api('/sessions'))
      .query({ groupId: reassignedId })
      .set(as(noorToken))
      .expect(403);

    const anaSees = await request(server())
      .get(api('/sessions'))
      .query({ pageSize: 100 })
      .set(as(anaToken))
      .expect(200);
    const adminAsAna = await request(server())
      .get(api('/sessions'))
      .query({ instructorId: ana, pageSize: 100 })
      .set(as(adminToken))
      .expect(200);
    expect(
      listed(adminAsAna)
        .map((row) => row.id)
        .sort(),
    ).toEqual(
      listed(anaSees)
        .map((row) => row.id)
        .sort(),
    );
    expect(listed(adminAsAna).some((row) => row.id === past.id)).toBe(true);
    expect(listed(adminAsAna).some((row) => row.id === futureId)).toBe(false);
  });
});
