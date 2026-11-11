import type { INestApplication } from '@nestjs/common';
import { ErrorCode, SystemRole, type HeldResult, type Session } from '@kidzzy/shared';
import request from 'supertest';
import type { App } from 'supertest/types';
import { PrismaService } from '../src/modules/prisma/prisma.service';
import { createAcademy, createTestApp, createUser, readCookies, removeAcademy } from './helpers';

// SCRUM-80: the actual start and end, entered as local clock times when a session is marked Held.
// Every session here is built by hand with a fixed planned time; `now` is moved per test.

const password = 'correct-horse-1';

describe('The actual times of a Held session (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let academyId: string;
  let otherAcademyId: string;
  let adminToken: string;
  let anaToken: string;
  let bobToken: string;
  let otherAdminToken: string;
  let ana: string;
  let bob: string;
  let now = new Date('2026-11-10T20:00:00.000Z');
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
    app = await createTestApp({ loginRateLimit: 1000, now: () => now });
    prisma = app.get(PrismaService);
    academyId = await createAcademy(prisma, 'actual-times');
    otherAcademyId = await createAcademy(prisma, 'actual-times-other');
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
    bob = await createUser(prisma, academyId, {
      name: 'bob',
      email: mail('bob'),
      password,
      role: SystemRole.Instructor,
    });
    await createUser(prisma, otherAcademyId, {
      name: 'other-admin',
      email: mail('other-admin'),
      password,
      role: SystemRole.Admin,
    });
    adminToken = await login(mail('admin'));
    anaToken = await login(mail('ana'));
    bobToken = await login(mail('bob'));
    otherAdminToken = await login(mail('other-admin'));
  });

  afterAll(async () => {
    await removeAcademy(prisma, academyId);
    await removeAcademy(prisma, otherAcademyId);
    await app.close();
  });

  /** A group of its own with one Scheduled session at this instant, taught by ana. */
  async function newSession(scheduledAt: string, status: 'scheduled' | 'held' = 'scheduled') {
    const name = `Times ${Math.random().toString(36).slice(2, 8)}`;
    const group = await prisma.unscoped.group.create({
      data: {
        academyId,
        name,
        level: 'Scratch 1',
        searchText: `${name} Scratch 1`,
        instructorId: ana,
        startDate: new Date('2026-10-01T00:00:00.000Z'),
      },
    });
    return prisma.unscoped.session.create({
      data: {
        academyId,
        groupId: group.id,
        instructorId: ana,
        scheduledAt: new Date(scheduledAt),
        durationMin: 60,
        status,
        ...(status === 'held' ? { sessionNumber: 1 } : {}),
      },
    });
  }

  const hold = (id: string, times: object, token = adminToken, topic = 'Loops') =>
    request(server())
      .post(api(`/sessions/${id}/held`))
      .set(as(token))
      .send({ topic, attendance: [], ...times });
  const patch = (id: string, body: object, token = adminToken) =>
    request(server())
      .patch(api(`/sessions/${id}`))
      .set(as(token))
      .send(body);
  const stored = (id: string) =>
    prisma.unscoped.session.findUniqueOrThrow({
      where: { id },
      select: { status: true, actualStartedAt: true, actualEndedAt: true, topic: true },
    });
  const iso = (value: Date | null) => value?.toISOString() ?? null;
  const entries = (id: string, action: string) =>
    prisma.unscoped.auditLog.findMany({ where: { academyId, entityId: id, action } });

  describe('marking Held', () => {
    it('stores the clock times as instants in winter (UTC+2), and returns the duration', async () => {
      now = new Date('2026-11-10T20:00:00.000Z');
      const session = await newSession('2026-11-10T15:00:00.000Z'); // 17:00 in Cairo
      const res = await hold(session.id, { startedAt: '17:05', endedAt: '18:10' }).expect(200);
      const held = res.body as HeldResult;
      expect(held).toMatchObject({
        status: 'held',
        actualStartedAt: '2026-11-10T15:05:00.000Z',
        actualEndedAt: '2026-11-10T16:10:00.000Z',
        actualDurationMin: 65,
      });
      const row = await stored(session.id);
      expect([iso(row.actualStartedAt), iso(row.actualEndedAt)]).toEqual([
        '2026-11-10T15:05:00.000Z',
        '2026-11-10T16:10:00.000Z',
      ]);
      const read = await request(server())
        .get(api(`/sessions/${session.id}`))
        .set(as(adminToken))
        .expect(200);
      expect(read.body).toMatchObject({
        actualDurationMin: 65,
        actualStartedAt: held.actualStartedAt,
      });
    });

    it('uses UTC+3 in summer', async () => {
      now = new Date('2026-07-10T20:00:00.000Z');
      const session = await newSession('2026-07-10T14:00:00.000Z'); // 17:00 in Cairo
      const res = await hold(session.id, { startedAt: '17:00', endedAt: '18:00' }).expect(200);
      expect(res.body).toMatchObject({
        actualStartedAt: '2026-07-10T14:00:00.000Z',
        actualEndedAt: '2026-07-10T15:00:00.000Z',
        actualDurationMin: 60,
      });
    });

    it('follows the clock change of 2026-10-29/30', async () => {
      now = new Date('2026-11-02T00:00:00.000Z');
      // 23:30 on the 29th is in the hour that repeats; the schedule means the first one (UTC+3).
      const night = await newSession('2026-10-29T20:30:00.000Z');
      const nightRes = await hold(night.id, { startedAt: '23:30', endedAt: '00:30' }).expect(200);
      expect(nightRes.body).toMatchObject({
        actualStartedAt: '2026-10-29T20:30:00.000Z',
        // 00:30 on the 30th is UTC+2: two real hours after the start.
        actualEndedAt: '2026-10-29T22:30:00.000Z',
        actualDurationMin: 120,
      });
      const after = await newSession('2026-10-30T15:00:00.000Z'); // 17:00, now UTC+2
      const afterRes = await hold(after.id, { startedAt: '17:00', endedAt: '18:00' }).expect(200);
      expect(afterRes.body).toMatchObject({
        actualStartedAt: '2026-10-30T15:00:00.000Z',
        actualEndedAt: '2026-10-30T16:00:00.000Z',
      });
    });

    it('puts an end earlier than the start on the next date (a session across midnight)', async () => {
      now = new Date('2026-11-12T00:00:00.000Z');
      const session = await newSession('2026-11-10T21:30:00.000Z'); // 23:30 in Cairo
      const res = await hold(session.id, { startedAt: '23:30', endedAt: '00:40' }).expect(200);
      expect(res.body).toMatchObject({
        actualStartedAt: '2026-11-10T21:30:00.000Z',
        actualEndedAt: '2026-11-10T22:40:00.000Z',
        actualDurationMin: 70,
      });
      // A late evening start read as 8 hours when the end is the morning after.
      const long = await newSession('2026-11-10T20:00:00.000Z'); // 22:00
      const longRes = await hold(long.id, { startedAt: '22:00', endedAt: '06:00' }).expect(200);
      expect(longRes.body).toMatchObject({ actualDurationMin: 480 });
    });

    it('refuses an end in the future with 422 on endedAt, and writes nothing', async () => {
      now = new Date('2026-11-10T16:00:00.000Z');
      const session = await newSession('2026-11-10T15:00:00.000Z');
      const res = await hold(session.id, { startedAt: '17:00', endedAt: '18:30' }); // ends 16:30Z
      expect(res.status).toBe(422);
      expect(res.body).toMatchObject({
        code: ErrorCode.ActualTimeInvalid,
        errors: [{ field: 'endedAt' }],
      });
      expect(await stored(session.id)).toMatchObject({
        status: 'scheduled',
        actualStartedAt: null,
        actualEndedAt: null,
        topic: null,
      });
      expect(await entries(session.id, 'session.held')).toHaveLength(0);
    });

    it('accepts an end exactly at now', async () => {
      now = new Date('2026-11-10T16:00:00.000Z');
      const session = await newSession('2026-11-10T15:00:00.000Z');
      await hold(session.id, { startedAt: '17:00', endedAt: '18:00' }).expect(200);
    });

    it('refuses the same start and end with 422', async () => {
      now = new Date('2026-11-10T20:00:00.000Z');
      const session = await newSession('2026-11-10T15:00:00.000Z');
      const res = await hold(session.id, { startedAt: '17:00', endedAt: '17:00' });
      expect(res.status).toBe(422);
      expect(res.body).toMatchObject({ code: ErrorCode.ActualTimeInvalid });
    });

    it.each([
      ['a time without the leading zero', { startedAt: '5:05', endedAt: '18:00' }],
      ['an hour over 23', { startedAt: '17:00', endedAt: '24:00' }],
      ['minutes over 59', { startedAt: '17:60', endedAt: '18:00' }],
      ['seconds', { startedAt: '17:00:00', endedAt: '18:00' }],
      ['a number', { startedAt: 1700, endedAt: '18:00' }],
      ['a missing start', { endedAt: '18:00' }],
      ['a missing end', { startedAt: '17:00' }],
    ])('refuses %s with 400', async (_name, times) => {
      now = new Date('2026-11-10T20:00:00.000Z');
      const session = await newSession('2026-11-10T15:00:00.000Z');
      const res = await hold(session.id, times);
      expect(res.status).toBe(400);
      expect(res.body).toMatchObject({ code: ErrorCode.ValidationFailed });
      expect((await stored(session.id)).status).toBe('scheduled');
    });

    it('has no minimum, no maximum and no rule on lateness', async () => {
      now = new Date('2026-11-10T20:00:00.000Z');
      const minute = await newSession('2026-11-10T15:00:00.000Z');
      expect(
        (await hold(minute.id, { startedAt: '17:30', endedAt: '17:31' }).expect(200)).body,
      ).toMatchObject({ actualDurationMin: 1 });
      const long = await newSession('2026-11-10T15:00:00.000Z');
      expect(
        (await hold(long.id, { startedAt: '06:00', endedAt: '16:00' }).expect(200)).body,
      ).toMatchObject({ actualDurationMin: 600 }); // ten hours, and it started before the plan
    });

    it('writes the instants in the audit entry of the Held', async () => {
      now = new Date('2026-11-10T20:00:00.000Z');
      const session = await newSession('2026-11-10T15:00:00.000Z');
      await hold(session.id, { startedAt: '17:05', endedAt: '18:10' }).expect(200);
      const [entry] = await entries(session.id, 'session.held');
      expect(entry?.after).toMatchObject({
        actualStartedAt: '2026-11-10T15:05:00.000Z',
        actualEndedAt: '2026-11-10T16:10:00.000Z',
      });
    });

    it('is in the report to the admins', async () => {
      now = new Date('2026-11-10T20:00:00.000Z');
      const session = await newSession('2026-11-10T15:00:00.000Z');
      await hold(session.id, { startedAt: '17:05', endedAt: '18:10' }).expect(200);
      const notes = await prisma.unscoped.notification.findMany({
        where: {
          academyId,
          type: 'session_report',
          data: { path: ['sessionId'], equals: session.id },
        },
      });
      expect(notes.length).toBeGreaterThan(0);
      expect(notes[0]?.body).toContain('المدة ساعة و5 دقايق');
    });
  });

  describe('the Session fields', () => {
    it('are null for a session that is not Held and for one held before the times existed', async () => {
      now = new Date('2026-11-10T20:00:00.000Z');
      const scheduled = await newSession('2026-11-10T15:00:00.000Z');
      const old = await newSession('2026-11-09T15:00:00.000Z', 'held'); // null columns
      for (const id of [scheduled.id, old.id]) {
        const res = await request(server())
          .get(api(`/sessions/${id}`))
          .set(as(adminToken))
          .expect(200);
        expect(res.body).toMatchObject({
          actualStartedAt: null,
          actualEndedAt: null,
          actualDurationMin: null,
        });
      }
    });
  });

  describe('correcting the times', () => {
    async function heldSession() {
      now = new Date('2026-11-10T20:00:00.000Z');
      const session = await newSession('2026-11-10T15:00:00.000Z');
      await hold(session.id, { startedAt: '17:05', endedAt: '18:10' }).expect(200);
      return session;
    }

    it('lets the instructor on the session change both times, audited before and after', async () => {
      const session = await heldSession();
      const res = await patch(session.id, { startedAt: '17:00', endedAt: '18:30' }, anaToken);
      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({
        actualStartedAt: '2026-11-10T15:00:00.000Z',
        actualEndedAt: '2026-11-10T16:30:00.000Z',
        actualDurationMin: 90,
      });
      const [entry] = await entries(session.id, 'session.actual_times_changed');
      expect(entry).toMatchObject({
        before: {
          actualStartedAt: '2026-11-10T15:05:00.000Z',
          actualEndedAt: '2026-11-10T16:10:00.000Z',
        },
        after: {
          actualStartedAt: '2026-11-10T15:00:00.000Z',
          actualEndedAt: '2026-11-10T16:30:00.000Z',
        },
      });
    });

    it('lets the admin change them, and writes no entry when nothing changes', async () => {
      const session = await heldSession();
      await patch(session.id, { startedAt: '17:05', endedAt: '18:10' }).expect(200);
      expect(await entries(session.id, 'session.actual_times_changed')).toHaveLength(0);
      await patch(session.id, { startedAt: '17:10', endedAt: '18:10' }).expect(200);
      expect(await entries(session.id, 'session.actual_times_changed')).toHaveLength(1);
    });

    it('refuses another instructor with 403, and another academy with 404', async () => {
      const session = await heldSession();
      await patch(session.id, { startedAt: '17:00', endedAt: '18:00' }, bobToken).expect(403);
      await patch(session.id, { startedAt: '17:00', endedAt: '18:00' }, otherAdminToken).expect(
        404,
      );
      expect(bob).toBeTruthy();
    });

    it('refuses a Scheduled session with 409', async () => {
      now = new Date('2026-11-10T20:00:00.000Z');
      const session = await newSession('2026-11-10T15:00:00.000Z');
      const res = await patch(session.id, { startedAt: '17:00', endedAt: '18:00' });
      expect(res.status).toBe(409);
      expect(res.body).toMatchObject({ code: ErrorCode.SessionNotHeld });
    });

    it('applies the Held rules: a future end is 422, one time alone and an empty body are 400', async () => {
      const session = await heldSession();
      now = new Date('2026-11-10T16:00:00.000Z');
      const future = await patch(session.id, { startedAt: '17:00', endedAt: '19:00' });
      expect(future.status).toBe(422);
      expect(future.body).toMatchObject({ code: ErrorCode.ActualTimeInvalid });
      await patch(session.id, { startedAt: '17:00' }).expect(400);
      await patch(session.id, { endedAt: '18:00' }).expect(400);
      await patch(session.id, {}).expect(400);
      await patch(session.id, { startedAt: '5:00', endedAt: '18:00' }).expect(400);
    });

    it('still corrects the topic alone, and leaves the times; a refused time leaves the topic', async () => {
      const session = await heldSession();
      const topic = await patch(session.id, { topic: 'Functions' }).expect(200);
      expect(topic.body).toMatchObject({ topic: 'Functions', actualDurationMin: 65 });
      now = new Date('2026-11-10T16:00:00.000Z');
      await patch(session.id, { topic: 'Variables', startedAt: '17:00', endedAt: '19:00' }).expect(
        422,
      );
      expect((await stored(session.id)).topic).toBe('Functions');
      now = new Date('2026-11-10T20:00:00.000Z');
      const both = await patch(session.id, {
        topic: 'Variables',
        startedAt: '17:00',
        endedAt: '18:00',
      });
      expect(both.status).toBe(200);
      expect(both.body).toMatchObject({ topic: 'Variables', actualDurationMin: 60 });
    });
  });

  describe('undoing', () => {
    it('clears both times, and the audit keeps them', async () => {
      now = new Date('2026-11-10T20:00:00.000Z');
      const session = await newSession('2026-11-10T15:00:00.000Z');
      await hold(session.id, { startedAt: '17:05', endedAt: '18:10' }).expect(200);
      const res = await request(server())
        .post(api(`/sessions/${session.id}/undo-held`))
        .set(as(adminToken))
        .expect(200);
      expect(res.body as Session).toMatchObject({
        status: 'scheduled',
        actualStartedAt: null,
        actualEndedAt: null,
        actualDurationMin: null,
      });
      expect(await stored(session.id)).toMatchObject({
        actualStartedAt: null,
        actualEndedAt: null,
      });
      const [entry] = await entries(session.id, 'session.held_undone');
      expect(entry?.before).toMatchObject({
        actualStartedAt: '2026-11-10T15:05:00.000Z',
        actualEndedAt: '2026-11-10T16:10:00.000Z',
      });
      expect(entry?.after).toMatchObject({ actualStartedAt: null, actualEndedAt: null });
    });
  });

  it('keeps the database check: the end after the start, or both null', async () => {
    const session = await newSession('2026-11-10T15:00:00.000Z');
    await expect(
      prisma.unscoped.session.update({
        where: { id: session.id },
        data: { actualStartedAt: new Date('2026-11-10T15:00:00Z') },
      }),
    ).rejects.toThrow();
    await expect(
      prisma.unscoped.session.update({
        where: { id: session.id },
        data: {
          actualStartedAt: new Date('2026-11-10T16:00:00Z'),
          actualEndedAt: new Date('2026-11-10T15:00:00Z'),
        },
      }),
    ).rejects.toThrow();
  });
});
