import type { INestApplication } from '@nestjs/common';
import { SystemRole, type Group } from '@kidzzy/shared';
import request from 'supertest';
import type { App } from 'supertest/types';
import { PrismaService } from '../src/modules/prisma/prisma.service';
import { SessionGenerationJob } from '../src/modules/sessions/session-generation.job';
import { SessionGenerator } from '../src/modules/sessions/session-generator';
import { TenantContext } from '../src/modules/tenancy/tenant-context';
import { createAcademy, createTestApp, createUser, readCookies, removeAcademy } from './helpers';

// US-11 (SCRUM-22): sessions are generated from the weekly schedule. AC: running it twice makes no
// duplicates, and inactive groups are skipped. "Now" is fixed: Friday 2026-10-16 at noon in
// Cairo, 4 weeks of horizon (the default), so the window is 2026-10-16 .. 2026-11-12.

const NOW = new Date('2026-10-16T09:00:00.000Z'); // 12:00 in Cairo (UTC+3)

describe('Session generation (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let generator: SessionGenerator;
  let tenant: TenantContext;
  let academyId: string;
  let otherAcademyId: string;
  let ana: string;
  let adminToken: string;
  const password = 'correct-horse-1';
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  const mail = (name: string) => `${name}-${stamp}@test.local`;

  const server = () => app.getHttpServer();
  const api = (path: string) => `/api/v1${path}`;
  const slot = (weekday: number, startTime: string, durationMin = 60) => ({
    weekday,
    startTime,
    durationMin,
  });

  function createGroup(body: Record<string, unknown> = {}) {
    return request(server())
      .post(api('/groups'))
      .set({ Cookie: `access_token=${adminToken}` })
      .send({
        name: `Group ${Math.random().toString(36).slice(2, 7)}`,
        level: 'Scratch 1',
        instructorId: ana,
        startDate: '2026-10-01',
        schedule: [slot(4, '17:00')], // Thursdays
        ...body,
      });
  }

  const sessionsOf = (groupId: string) =>
    prisma.unscoped.session.findMany({ where: { groupId }, orderBy: { scheduledAt: 'asc' } });

  beforeAll(async () => {
    app = await createTestApp({ loginRateLimit: 1000, now: NOW });
    prisma = app.get(PrismaService);
    generator = app.get(SessionGenerator);
    tenant = app.get(TenantContext);
    academyId = await createAcademy(prisma, 'generation');
    otherAcademyId = await createAcademy(prisma, 'generation-other');
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
    const res = await request(server())
      .post(api('/auth/login'))
      .send({ login: mail('admin'), password })
      .expect(200);
    adminToken = readCookies(res.headers['set-cookie']).access_token.value;
  });

  afterAll(async () => {
    await removeAcademy(prisma, academyId);
    await removeAcademy(prisma, otherAcademyId);
    await app.close();
  });

  it('creating a group generates its sessions for the horizon, with the instructor copied', async () => {
    const res = await createGroup().expect(201);
    const group = res.body as Group;
    const sessions = await sessionsOf(group.id);

    // Thursdays from 2026-10-16 to 2026-11-12: Oct 22, Oct 29, Nov 5, Nov 12.
    expect(sessions.map((s) => s.occurrenceDate?.toISOString().slice(0, 10))).toEqual([
      '2026-10-22',
      '2026-10-29',
      '2026-11-05',
      '2026-11-12',
    ]);
    expect(sessions.every((s) => s.status === 'scheduled' && s.sessionNumber === null)).toBe(true);
    expect(sessions.every((s) => s.instructorId === ana && s.academyId === academyId)).toBe(true);
    expect(sessions.every((s) => s.slotAcademyId === academyId && !s.isMakeup)).toBe(true);
    expect(sessions.every((s) => s.durationMin === 60)).toBe(true);
    // The group answers with the next session.
    expect(group.nextSessionAt).toBe('2026-10-22T14:00:00.000Z');
    expect(group.heldCount).toBe(0);
  });

  it('keeps 17:00 local on both sides of the end of daylight saving time (Cairo)', async () => {
    const group = (
      await createGroup({ schedule: [slot(4, '17:00'), slot(5, '17:00')] }).expect(201)
    ).body as Group;
    const times = (await sessionsOf(group.id)).map((s) => s.scheduledAt.toISOString());
    // Thursday 2026-10-29 is UTC+3, Friday 2026-10-30 is UTC+2 (DST ended at midnight).
    expect(times).toContain('2026-10-29T14:00:00.000Z');
    expect(times).toContain('2026-10-30T15:00:00.000Z');
    expect(times).toContain('2026-11-05T15:00:00.000Z');
  });

  it('AC: running the generation again, or twice at once, creates no duplicates', async () => {
    const group = (await createGroup().expect(201)).body as Group;
    const before = await sessionsOf(group.id);

    const counts = await tenant.run(academyId, async () => {
      const again = await generator.generateForGroup(group.id);
      const parallel = await Promise.all([
        generator.generateForGroup(group.id),
        generator.generateForGroup(group.id),
        generator.generateForAcademy(),
      ]);
      return [again, ...parallel];
    });
    expect(counts.slice(0, 3)).toEqual([0, 0, 0]);
    const after = await sessionsOf(group.id);
    expect(after.map((s) => s.id)).toEqual(before.map((s) => s.id));
  });

  it('starts at the group’s start date when it is in the future', async () => {
    const group = (await createGroup({ startDate: '2026-11-03' }).expect(201)).body as Group;
    expect(
      (await sessionsOf(group.id)).map((s) => s.occurrenceDate?.toISOString().slice(0, 10)),
    ).toEqual(['2026-11-05', '2026-11-12']);
  });

  it('AC: skips inactive groups, and generates again when the group is active', async () => {
    const group = (await createGroup({ startDate: '2026-12-01' }).expect(201)).body as Group;
    await prisma.unscoped.session.deleteMany({ where: { groupId: group.id } });
    await prisma.unscoped.group.update({ where: { id: group.id }, data: { isActive: false } });

    await tenant.run(academyId, () => generator.generateForAcademy());
    expect(await sessionsOf(group.id)).toHaveLength(0);

    await prisma.unscoped.group.update({ where: { id: group.id }, data: { isActive: true } });
    await prisma.unscoped.group.update({
      where: { id: group.id },
      data: { startDate: new Date('2026-10-01') },
    });
    await tenant.run(academyId, () => generator.generateForAcademy());
    expect(await sessionsOf(group.id)).toHaveLength(4);
  });

  it('does not regenerate a day whose session was rescheduled (the occurrence date stays)', async () => {
    const group = (await createGroup().expect(201)).body as Group;
    const [first] = await sessionsOf(group.id);
    // A reschedule (US-15) changes the time, not the occurrence date.
    await prisma.unscoped.session.update({
      where: { id: first.id },
      data: { scheduledAt: new Date('2026-10-23T10:00:00.000Z') },
    });
    await tenant.run(academyId, () => generator.generateForGroup(group.id));
    expect(await sessionsOf(group.id)).toHaveLength(4);
  });

  it('the daily job works through every academy, each inside its own tenant', async () => {
    // A group in another academy, created straight in the database.
    const otherInstructor = await createUser(prisma, otherAcademyId, {
      name: 'zed',
      email: mail('zed'),
      password,
      role: SystemRole.Instructor,
    });
    const otherGroup = await prisma.unscoped.group.create({
      data: {
        academyId: otherAcademyId,
        name: 'Other',
        level: 'x',
        searchText: 'other x',
        instructorId: otherInstructor,
        startDate: new Date('2026-10-01'),
        slots: {},
      },
    });
    await prisma.unscoped.scheduleSlot.create({
      data: {
        academyId: otherAcademyId,
        groupId: otherGroup.id,
        weekday: 0,
        startTime: new Date('1970-01-01T09:00:00.000Z'),
        durationMin: 90,
      },
    });

    const created = await app.get(SessionGenerationJob).generateForAllAcademies();
    expect(created).toBeGreaterThanOrEqual(4);
    const sessions = await sessionsOf(otherGroup.id);
    // Sundays 2026-10-18, 25, Nov 1, 8 at 09:00 Cairo.
    expect(sessions.map((s) => s.scheduledAt.toISOString())).toEqual([
      '2026-10-18T06:00:00.000Z',
      '2026-10-25T06:00:00.000Z', // still UTC+3: DST ends on the 29th
      '2026-11-01T07:00:00.000Z',
      '2026-11-08T07:00:00.000Z',
    ]);
    expect(sessions.every((s) => s.academyId === otherAcademyId)).toBe(true);
    // The first academy's groups were not touched by the other academy's run.
    expect(await prisma.unscoped.session.count({ where: { academyId } })).toBeGreaterThan(0);
  });

  describe('database checks (they hold whoever writes the row)', () => {
    let groupId: string;
    let slotId: string;
    beforeAll(async () => {
      groupId = (await prisma.unscoped.group.findFirstOrThrow({ where: { academyId } })).id;
      slotId = (await prisma.unscoped.scheduleSlot.findFirstOrThrow({ where: { groupId } })).id;
    });

    const insert = (columns: {
      slot?: boolean;
      slotAcademy?: string | null;
      occurrence?: string | null;
      status?: string;
      number?: number | null;
      reason?: string | null;
      duration?: number;
      makeup?: boolean;
    }) =>
      prisma.unscoped.$executeRaw`
        INSERT INTO sessions (id, academy_id, group_id, instructor_id, slot_id, slot_academy_id,
          occurrence_date, scheduled_at, duration_min, status, session_number, is_makeup,
          cancel_reason, updated_at)
        VALUES (gen_random_uuid(), ${academyId}::uuid, ${groupId}::uuid, ${ana}::uuid,
          ${columns.slot === false ? null : slotId}::uuid, ${columns.slotAcademy === undefined ? academyId : columns.slotAcademy}::uuid,
          ${columns.occurrence === undefined ? '2030-01-01' : columns.occurrence}::date,
          now(), ${columns.duration ?? 60}, ${columns.status ?? 'scheduled'}::session_status,
          ${columns.number ?? null}, ${columns.makeup ?? false}, ${columns.reason ?? null}, now())`;

    it.each([
      ['a slot without its academy mirror', { slotAcademy: null }],
      [
        'a slot mirrored to another academy',
        { slotAcademy: '00000000-0000-4000-8000-000000000001' },
      ],
      ['a slot without an occurrence date', { occurrence: null }],
      ['a make-up that has a slot', { makeup: true }],
      ['a number on a scheduled session', { number: 1 }],
      ['a cancelled session without a reason', { status: 'cancelled' }],
      ['a duration of 10', { duration: 10 }],
    ])('refuses %s', async (_label, columns) => {
      await expect(insert({ occurrence: '2030-01-02', ...columns })).rejects.toThrow();
    });

    it('refuses the same slot on the same day twice (the no-duplicate guarantee)', async () => {
      await insert({ occurrence: '2031-05-05' });
      await expect(insert({ occurrence: '2031-05-05' })).rejects.toThrow(
        /sessions_slot_id_occurrence_date_key/,
      );
    });

    it('accepts a make-up without a slot, and a cancelled session with a reason', async () => {
      await expect(
        insert({ slot: false, slotAcademy: null, occurrence: null, makeup: true }),
      ).resolves.toBe(1);
      await expect(
        insert({ occurrence: '2031-06-06', status: 'cancelled', reason: 'Instructor ill' }),
      ).resolves.toBe(1);
    });

    it('refuses two held sessions with the same number in a group (BR-03)', async () => {
      await insert({ occurrence: '2031-07-07', status: 'held', number: 7 });
      await expect(insert({ occurrence: '2031-07-08', status: 'held', number: 7 })).rejects.toThrow(
        /sessions_group_id_session_number_key/,
      );
    });
  });
});
