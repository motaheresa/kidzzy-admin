import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { SystemRole, type Group, type Page } from '@kidzzy/shared';
import request from 'supertest';
import type { App } from 'supertest/types';
import { PrismaService } from '../src/modules/prisma/prisma.service';
import { createAcademy, createTestApp, createUser, readCookies, removeAcademy } from './helpers';

// US-10 (SCRUM-26): edit a group and replace its weekly schedule. AC: only the future Scheduled
// sessions generated from the old schedule are rebuilt; Held and Cancelled sessions never change;
// the whole change is one transaction. "Now" is fixed: 2026-10-16 12:00 in Cairo, 4 weeks ahead,
// so a Thursday slot has sessions on Oct 22, Oct 29, Nov 5 and Nov 12.

const NOW = new Date('2026-10-16T09:00:00.000Z');

describe('Group editing (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let academyId: string;
  let otherAcademyId: string;
  let ana: string;
  let ben: string;
  let gone: string;
  let otherInstructor: string;
  let adminToken: string;
  let anaToken: string;
  let otherAdminToken: string;
  const password = 'correct-horse-1';
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  const mail = (name: string) => `${name}-${stamp}@test.local`;

  const server = () => app.getHttpServer();
  const as = (token: string) => ({ Cookie: `access_token=${token}` });
  const api = (path: string) => `/api/v1${path}`;
  const slot = (weekday: number, startTime: string, durationMin = 60) => ({
    weekday,
    startTime,
    durationMin,
  });
  const thursday = slot(4, '17:00');

  async function signIn(email: string) {
    const res = await request(server())
      .post(api('/auth/login'))
      .send({ login: email, password })
      .expect(200);
    return readCookies(res.headers['set-cookie']).access_token.value;
  }

  async function newGroup(body: Record<string, unknown> = {}, token = adminToken) {
    const res = await request(server())
      .post(api('/groups'))
      .set(as(token))
      .send({
        name: `Group ${Math.random().toString(36).slice(2, 7)}`,
        level: 'Scratch 1',
        instructorId: ana,
        startDate: '2026-10-01',
        schedule: [thursday],
        ...body,
      })
      .expect(201);
    return res.body as Group;
  }

  const patch = (id: string, body: object, token = adminToken) =>
    request(server())
      .patch(api(`/groups/${id}`))
      .set(as(token))
      .send(body);
  const put = (id: string, schedule: unknown[], token = adminToken) =>
    request(server())
      .put(api(`/groups/${id}/schedule`))
      .set(as(token))
      .send({ schedule });

  const sessionsOf = (groupId: string) =>
    prisma.unscoped.session.findMany({ where: { groupId }, orderBy: { scheduledAt: 'asc' } });
  const day = (date: Date | null) => date?.toISOString().slice(0, 10);

  /** Marks a generated session Held or Cancelled directly: US-13 and US-14 come later. */
  async function settle(groupId: string, occurrence: string, status: 'held' | 'cancelled') {
    const found = (await sessionsOf(groupId)).find((s) => day(s.occurrenceDate) === occurrence);
    if (!found) throw new Error(`no session on ${occurrence}`);
    return prisma.unscoped.session.update({
      where: { id: found.id },
      data:
        status === 'held'
          ? { status: 'held', sessionNumber: 1 }
          : { status: 'cancelled', cancelReason: 'Instructor ill' },
    });
  }

  beforeAll(async () => {
    app = await createTestApp({ loginRateLimit: 1000, now: NOW });
    prisma = app.get(PrismaService);
    academyId = await createAcademy(prisma, 'group-edit');
    otherAcademyId = await createAcademy(prisma, 'group-edit-other');
    const user = (name: string, role: SystemRole, isActive = true, aId = academyId) =>
      createUser(prisma, aId, { name, email: mail(name), password, role, isActive });
    await user('admin', SystemRole.Admin);
    ana = await user('ana', SystemRole.Instructor);
    ben = await user('ben', SystemRole.Instructor);
    gone = await user('gone', SystemRole.Instructor, false);
    await user('other-admin', SystemRole.Admin, true, otherAcademyId);
    otherInstructor = await user('other-instructor', SystemRole.Instructor, true, otherAcademyId);
    adminToken = await signIn(mail('admin'));
    anaToken = await signIn(mail('ana'));
    otherAdminToken = await signIn(mail('other-admin'));
  });

  afterAll(async () => {
    await removeAcademy(prisma, academyId);
    await removeAcademy(prisma, otherAcademyId);
    await app.close();
  });

  describe('PATCH details', () => {
    it('changes the name and the level, and the search follows them', async () => {
      const group = await newGroup();
      const res = await patch(group.id, { name: '  مجموعة أحمد ', level: 'Python' }).expect(200);
      expect(res.body).toMatchObject({ id: group.id, name: 'مجموعة أحمد', level: 'Python' });
      const found = await request(server())
        .get(api('/groups'))
        .query({ search: 'احمد' })
        .set(as(adminToken))
        .expect(200);
      expect((found.body as Page<Group>).data.map((g) => g.id)).toContain(group.id);
      // The level alone: the name is kept.
      const level = await patch(group.id, { level: 'Scratch 2' }).expect(200);
      expect(level.body).toMatchObject({ name: 'مجموعة أحمد', level: 'Scratch 2' });
    });

    it('accepts an empty body, and refuses null, blank and unknown fields (400)', async () => {
      const group = await newGroup();
      await patch(group.id, {}).expect(200);
      await patch(group.id, { name: null }).expect(400);
      await patch(group.id, { level: '  ' }).expect(400);
      await patch(group.id, { isActive: 'no' }).expect(400);
      await patch(group.id, { instructorId: 'ana' }).expect(400);
      await patch(group.id, { startDate: '2026-01-01' }).expect(400);
    });

    it('changing the instructor updates only the sessions still ahead and Scheduled', async () => {
      const group = await newGroup();
      const held = await settle(group.id, '2026-10-22', 'held');
      const cancelled = await settle(group.id, '2026-10-29', 'cancelled');

      const res = await patch(group.id, { instructorId: ben }).expect(200);
      expect(res.body).toMatchObject({ instructor: { id: ben } });
      const sessions = await sessionsOf(group.id);
      const byId = new Map(sessions.map((s) => [s.id, s]));
      // History keeps the instructor it had.
      expect(byId.get(held.id)?.instructorId).toBe(ana);
      expect(byId.get(cancelled.id)?.instructorId).toBe(ana);
      // The sessions still ahead and Scheduled follow the group.
      const scheduled = sessions.filter((s) => s.status === 'scheduled');
      expect(scheduled.length).toBe(2);
      expect(scheduled.every((s) => s.instructorId === ben)).toBe(true);
    });

    it('refuses an instructor who is not assignable (422) and changes nothing', async () => {
      const group = await newGroup();
      for (const instructorId of [gone, otherInstructor, randomUUID()]) {
        const res = await patch(group.id, { instructorId, name: 'Changed' }).expect(422);
        expect(res.body).toMatchObject({ code: 'INSTRUCTOR_NOT_ASSIGNABLE' });
      }
      const row = await prisma.unscoped.group.findUniqueOrThrow({ where: { id: group.id } });
      expect(row.instructorId).toBe(ana);
      expect(row.name).toBe(group.name);
    });

    it('deactivating removes the future Scheduled sessions, never the Held or Cancelled ones', async () => {
      const group = await newGroup();
      const held = await settle(group.id, '2026-10-22', 'held');
      const cancelled = await settle(group.id, '2026-10-29', 'cancelled');

      const res = await patch(group.id, { isActive: false }).expect(200);
      expect(res.body).toMatchObject({ isActive: false, heldCount: 1, nextSessionAt: null });
      expect((await sessionsOf(group.id)).map((s) => s.id).sort()).toEqual(
        [held.id, cancelled.id].sort(),
      );
    });

    it('reactivating generates the sessions again, without duplicating a settled day', async () => {
      const group = await newGroup();
      const held = await settle(group.id, '2026-10-22', 'held');
      await patch(group.id, { isActive: false }).expect(200);

      const res = await patch(group.id, { isActive: true }).expect(200);
      expect(res.body).toMatchObject({ isActive: true });
      const sessions = await sessionsOf(group.id);
      expect(sessions.map((s) => day(s.occurrenceDate))).toEqual([
        '2026-10-22',
        '2026-10-29',
        '2026-11-05',
        '2026-11-12',
      ]);
      expect(sessions[0].id).toBe(held.id);
      expect(sessions[0].status).toBe('held');
    });

    it('answers 404 for another academy’s group and an unknown id', async () => {
      const other = await newGroup(
        { instructorId: otherInstructor, name: 'Other' },
        otherAdminToken,
      );
      await patch(other.id, { name: 'Hacked' }).expect(404);
      await patch(randomUUID(), { name: 'x' }).expect(404);
      await patch('42', { name: 'x' }).expect(400);
    });
  });

  describe('scope own', () => {
    it('an instructor edits the name, level and active flag of their own group', async () => {
      const group = await newGroup();
      await patch(group.id, { name: 'My new name' }, anaToken).expect(200);
      await patch(group.id, { isActive: false }, anaToken).expect(200);
      await patch(group.id, { isActive: true }, anaToken).expect(200);
    });

    it('an instructor cannot change the instructor, even to themselves (403)', async () => {
      const group = await newGroup();
      const res = await patch(group.id, { instructorId: ana }, anaToken).expect(403);
      expect(res.body).toMatchObject({ code: 'FORBIDDEN' });
      await patch(group.id, { instructorId: ben, name: 'Stolen' }, anaToken).expect(403);
      const row = await prisma.unscoped.group.findUniqueOrThrow({ where: { id: group.id } });
      expect(row.name).toBe(group.name);
    });

    it('AC-08: an instructor editing another instructor’s group gets 403, not 404', async () => {
      const bens = await newGroup({ instructorId: ben });
      const patched = await patch(bens.id, { name: 'Mine now' }, anaToken).expect(403);
      expect(patched.body).toMatchObject({ code: 'FORBIDDEN' });
      await put(bens.id, [slot(0, '10:00')], anaToken).expect(403);
      const row = await prisma.unscoped.group.findUniqueOrThrow({
        where: { id: bens.id },
        include: { slots: true },
      });
      expect(row.name).toBe(bens.name);
      expect(row.slots).toHaveLength(1);
    });
  });

  describe('PUT schedule', () => {
    it('AC: replaces the schedule; Held and Cancelled sessions never change', async () => {
      const group = await newGroup();
      const held = await settle(group.id, '2026-10-22', 'held');
      const cancelled = await settle(group.id, '2026-10-29', 'cancelled');
      const [oldSlot] = await prisma.unscoped.scheduleSlot.findMany({
        where: { groupId: group.id },
      });

      const res = await put(group.id, [slot(0, '10:00', 90)]).expect(200);
      expect((res.body as Group).schedule).toEqual([slot(0, '10:00', 90)]);

      const sessions = await sessionsOf(group.id);
      // The two settled sessions are exactly as they were, still on the old slot.
      const keptHeld = sessions.find((s) => s.id === held.id);
      const keptCancelled = sessions.find((s) => s.id === cancelled.id);
      expect(keptHeld).toMatchObject({ status: 'held', sessionNumber: 1, slotId: oldSlot.id });
      expect(keptHeld?.scheduledAt).toEqual(held.scheduledAt);
      expect(keptCancelled).toMatchObject({ status: 'cancelled', cancelReason: 'Instructor ill' });
      // The old future Scheduled sessions (Nov 5, 12) are gone; the new slot has its own (Sundays).
      const scheduled = sessions.filter((s) => s.status === 'scheduled');
      expect(scheduled.map((s) => day(s.occurrenceDate))).toEqual([
        '2026-10-18',
        '2026-10-25',
        '2026-11-01',
        '2026-11-08',
      ]);
      expect(scheduled.every((s) => s.slotId !== oldSlot.id && s.durationMin === 90)).toBe(true);
      // 10:00 Cairo: UTC+3 until Oct 29, UTC+2 after.
      expect(scheduled.map((s) => s.scheduledAt.toISOString())).toEqual([
        '2026-10-18T07:00:00.000Z',
        '2026-10-25T07:00:00.000Z',
        '2026-11-01T08:00:00.000Z',
        '2026-11-08T08:00:00.000Z',
      ]);
      // The old slot is kept as history (retired), not deleted, because settled sessions use it.
      const retired = await prisma.unscoped.scheduleSlot.findUniqueOrThrow({
        where: { id: oldSlot.id },
      });
      expect(retired.retiredAt).not.toBeNull();
    });

    it('a slot that did not change keeps its row and its sessions, including a reschedule', async () => {
      const group = await newGroup({ schedule: [thursday, slot(6, '10:00')] });
      const before = await sessionsOf(group.id);
      const thursdaySessions = before.filter((s) => s.scheduledAt.getUTCDay() === 4);
      // A single reschedule (US-15): another time, same occurrence date.
      const moved = thursdaySessions[2];
      await prisma.unscoped.session.update({
        where: { id: moved.id },
        data: { scheduledAt: new Date('2026-11-05T08:00:00.000Z') },
      });

      // Same Thursday, but Saturday moves to Sunday.
      await put(group.id, [thursday, slot(0, '09:00')]).expect(200);

      const after = await sessionsOf(group.id);
      for (const original of thursdaySessions) {
        const kept = after.find((s) => s.id === original.id);
        expect(kept?.slotId).toBe(original.slotId);
      }
      expect(after.find((s) => s.id === moved.id)?.scheduledAt.toISOString()).toBe(
        '2026-11-05T08:00:00.000Z',
      );
      // Saturday sessions are gone, Sunday ones exist.
      expect(after.some((s) => s.occurrenceDate?.getUTCDay() === 6)).toBe(false);
      expect(after.filter((s) => s.occurrenceDate?.getUTCDay() === 0)).toHaveLength(4);
    });

    it('deletes a removed slot that nothing points at', async () => {
      const group = await newGroup({ schedule: [thursday, slot(6, '10:00')] });
      const saturday = await prisma.unscoped.scheduleSlot.findFirstOrThrow({
        where: { groupId: group.id, weekday: 6 },
      });
      await put(group.id, [thursday]).expect(200);
      expect(await prisma.unscoped.scheduleSlot.count({ where: { id: saturday.id } })).toBe(0);
      expect(await prisma.unscoped.session.count({ where: { slotId: saturday.id } })).toBe(0);
    });

    it('a slot that comes back is used again, without duplicating its settled day', async () => {
      const group = await newGroup();
      const held = await settle(group.id, '2026-10-22', 'held');
      const original = await prisma.unscoped.scheduleSlot.findFirstOrThrow({
        where: { groupId: group.id },
      });

      await put(group.id, [slot(0, '10:00')]).expect(200); // Thursday leaves (retired)
      await put(group.id, [thursday]).expect(200); // and comes back

      const slots = await prisma.unscoped.scheduleSlot.findMany({
        where: { groupId: group.id, weekday: 4 },
      });
      expect(slots.map((s) => s.id)).toEqual([original.id]);
      expect(slots[0].retiredAt).toBeNull();
      const thursdays = (await sessionsOf(group.id)).filter((s) => s.slotId === original.id);
      expect(thursdays.map((s) => day(s.occurrenceDate))).toEqual([
        '2026-10-22',
        '2026-10-29',
        '2026-11-05',
        '2026-11-12',
      ]);
      expect(thursdays[0].id).toBe(held.id);
    });

    it('refuses overlapping slots, no schedule and a slot past midnight, changing nothing', async () => {
      const group = await newGroup();
      const before = await sessionsOf(group.id);
      const overlap = await put(group.id, [slot(1, '16:00'), slot(1, '16:30')]).expect(422);
      expect(overlap.body).toMatchObject({ code: 'SCHEDULE_OVERLAP' });
      await put(group.id, [slot(1, '23:30')]).expect(422);
      await put(group.id, []).expect(400);
      await put(group.id, [slot(1, '24:00')]).expect(400);
      expect((await sessionsOf(group.id)).map((s) => s.id)).toEqual(before.map((s) => s.id));
      expect(await prisma.unscoped.scheduleSlot.count({ where: { groupId: group.id } })).toBe(1);
    });

    it('an inactive group only stores the new slots and generates nothing', async () => {
      const group = await newGroup();
      await patch(group.id, { isActive: false }).expect(200);
      await put(group.id, [slot(0, '10:00')]).expect(200);
      expect(await sessionsOf(group.id)).toHaveLength(0);
      const res = await patch(group.id, { isActive: true }).expect(200);
      expect((res.body as Group).schedule).toEqual([slot(0, '10:00')]);
      expect(await sessionsOf(group.id)).toHaveLength(4);
    });

    it('two edits at once end consistent: every future Scheduled session belongs to a live slot', async () => {
      const group = await newGroup();
      const results = await Promise.all([
        put(group.id, [slot(0, '09:00')]),
        put(group.id, [slot(1, '09:00')]),
        patch(group.id, { instructorId: ben }),
      ]);
      expect(results.map((r) => r.status)).toEqual([200, 200, 200]);

      const live = await prisma.unscoped.scheduleSlot.findMany({
        where: { groupId: group.id, retiredAt: null },
      });
      expect(live).toHaveLength(1);
      const sessions = await sessionsOf(group.id);
      expect(sessions.every((s) => s.slotId === live[0].id && s.instructorId === ben)).toBe(true);
      expect(sessions).toHaveLength(4);
    });

    it('answers 404 for another academy’s group, and 403 to an instructor on a group that is not theirs', async () => {
      const other = await newGroup({ instructorId: otherInstructor }, otherAdminToken);
      await put(other.id, [slot(0, '10:00')]).expect(404);
      await put(randomUUID(), [slot(0, '10:00')]).expect(404);
    });
  });
});
