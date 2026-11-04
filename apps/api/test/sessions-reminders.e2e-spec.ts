import type { INestApplication } from '@nestjs/common';
import { SystemRole } from '@kidzzy/shared';
import { DateTime } from 'luxon';
import type { App } from 'supertest/types';
import { QUARTER_HOUR_CRON } from '../src/modules/notifications/quarter-hour';
import { PrismaService } from '../src/modules/prisma/prisma.service';
import { SessionReminderJob } from '../src/modules/sessions/session-reminder.job';
import { REMINDERS_PER_RUN } from '../src/modules/sessions/session-reminder.constants';
import { SessionReminderService } from '../src/modules/sessions/session-reminder.service';
import { TenantContext } from '../src/modules/tenancy/tenant-context';
import { createAcademy, createTestApp, createUser, removeAcademy } from './helpers';

// US-26 (SCRUM-44). The job is called directly. The startup run is off.

const password = 'correct-horse-1';

function cairo(local: string): Date {
  const value = DateTime.fromISO(local, { zone: 'Africa/Cairo' });
  if (!value.isValid) throw new Error(`Not a Cairo time: ${local}`);
  return value.toJSDate();
}

describe('Session reminders (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let job: SessionReminderJob;
  let reminders: SessionReminderService;
  let tenant: TenantContext;
  let now = cairo('2026-11-05T12:00:00');
  let academyId: string;
  let otherAcademyId: string;
  let instructorId: string;
  let otherInstructorId: string;
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  const mail = (name: string) => `${name}-${stamp}@test.local`;

  beforeAll(async () => {
    app = await createTestApp({ loginRateLimit: 1000, now: () => now });
    prisma = app.get(PrismaService);
    job = app.get(SessionReminderJob);
    reminders = app.get(SessionReminderService);
    tenant = app.get(TenantContext);
    academyId = await createAcademy(prisma, 'session-reminders');
    otherAcademyId = await createAcademy(prisma, 'session-reminders-other');
    instructorId = await createUser(prisma, academyId, {
      name: 'مدرس',
      email: mail('inst'),
      password,
      role: SystemRole.Instructor,
    });
    otherInstructorId = await createUser(prisma, otherAcademyId, {
      name: 'مدرس تاني',
      email: mail('other'),
      password,
      role: SystemRole.Instructor,
    });
  });

  afterAll(async () => {
    await removeAcademy(prisma, academyId);
    await removeAcademy(prisma, otherAcademyId);
    await app.close();
  });

  async function addSession(input: {
    at: Date;
    academy?: string;
    instructor?: string;
    name?: string;
    status?: 'scheduled' | 'held' | 'cancelled';
  }) {
    const academy = input.academy ?? academyId;
    const instructor = input.instructor ?? instructorId;
    const name = input.name ?? 'سكواتش';
    const group = await prisma.unscoped.group.create({
      data: {
        academyId: academy,
        name,
        level: 'Scratch 1',
        searchText: `${name} Scratch 1`,
        instructorId: instructor,
        startDate: new Date('2026-10-01T00:00:00.000Z'),
      },
    });
    return prisma.unscoped.session.create({
      data: {
        academyId: academy,
        groupId: group.id,
        instructorId: instructor,
        scheduledAt: input.at,
        durationMin: 60,
        status: input.status ?? 'scheduled',
        ...(input.status === 'cancelled' ? { cancelReason: 'ظرف' } : {}),
      },
    });
  }

  const notes = (userId: string) =>
    prisma.unscoped.notification.findMany({ where: { userId }, orderBy: { createdAt: 'asc' } });
  const claims = (sessionId: string) =>
    prisma.unscoped.sessionReminder.findMany({
      where: { sessionId },
      orderBy: { leadMinutes: 'desc' },
    });

  it('uses a quarter-hour cron', () => {
    expect(QUARTER_HOUR_CRON).toBe('0,15,30,45 * * * *');
  });

  it('sends the 1-day and 1-hour reminders once, on the first run after their moment', async () => {
    now = cairo('2026-11-05T12:00:00');
    const day = await addSession({ at: new Date(now.getTime() + 23 * 60 * 60_000), name: 'يوم' });
    const hour = await addSession({ at: new Date(now.getTime() + 50 * 60_000), name: 'ساعة' });

    await job.remindAll();
    await job.remindAll();

    const sent = await notes(instructorId);
    expect(sent.map((note) => note.title).sort()).toEqual(['تذكير: حصتك قربت', 'تذكير: عندك حصة']);
    expect(sent.find((note) => note.title === 'تذكير: عندك حصة')?.body).toBe(
      `جروب يوم ${DateTime.fromJSDate(day.scheduledAt, { zone: 'Africa/Cairo' }).setLocale('ar').toFormat('cccc')} الساعة 11:00 ص`,
    );
    expect(sent.find((note) => note.title === 'تذكير: حصتك قربت')?.body).toBe(
      'جروب ساعة الساعة 12:50 م',
    );
    expect(sent.find((note) => note.title === 'تذكير: حصتك قربت')?.data).toEqual({
      url: `/sessions/${hour.id}`,
      sessionId: hour.id,
    });
    expect(await claims(day.id)).toHaveLength(1);
    expect(await claims(hour.id)).toHaveLength(1);
  });

  it('sends nothing for a cancelled session or a held one', async () => {
    now = cairo('2026-11-05T12:00:00');
    const before = (await notes(instructorId)).length;
    await addSession({
      at: new Date(now.getTime() + 50 * 60_000),
      status: 'cancelled',
      name: 'ملغية',
    });
    await addSession({
      at: new Date(now.getTime() + 50 * 60_000),
      status: 'held',
      name: 'خلصت',
    });
    await job.remindAll();
    expect(await notes(instructorId)).toHaveLength(before);
  });

  it('follows a reschedule, and does not repeat a lead that was already sent', async () => {
    now = cairo('2026-11-05T12:00:00');
    const later = await addSession({
      at: new Date(now.getTime() + 10 * 60 * 60_000),
      name: 'بعدين',
    });
    await job.remindAll();
    expect(await claims(later.id)).toHaveLength(0);

    const movedEarlier = new Date(now.getTime() + 50 * 60_000);
    await prisma.unscoped.session.update({
      where: { id: later.id },
      data: { scheduledAt: movedEarlier },
    });
    await job.remindAll();
    const hourNotes = (await notes(instructorId)).filter((note) => note.body.includes('بعدين'));
    expect(hourNotes).toHaveLength(1);
    expect(hourNotes[0]?.title).toBe('تذكير: حصتك قربت');

    const day = await addSession({
      at: new Date(now.getTime() + 23 * 60 * 60_000),
      name: 'بكرة',
    });
    await job.remindAll();
    expect(await claims(day.id)).toMatchObject([{ leadMinutes: 1440 }]);
    await prisma.unscoped.session.update({
      where: { id: day.id },
      data: { scheduledAt: new Date(now.getTime() + 22 * 60 * 60_000) },
    });
    await job.remindAll();
    expect(await claims(day.id)).toHaveLength(1);
    expect((await notes(instructorId)).filter((note) => note.body.includes('بكرة'))).toHaveLength(
      1,
    );

    const soon = await addSession({ at: new Date(now.getTime() + 40 * 60_000), name: 'قريب' });
    await job.remindAll();
    expect(await claims(soon.id)).toMatchObject([{ leadMinutes: 60 }]);
    await prisma.unscoped.session.update({
      where: { id: soon.id },
      data: { scheduledAt: new Date(now.getTime() + 55 * 60_000) },
    });
    await job.remindAll();
    expect(await claims(soon.id)).toHaveLength(1);
  });

  it('reminds the instructor on the session, including after a change', async () => {
    now = cairo('2026-11-05T12:00:00');
    const replacement = await createUser(prisma, academyId, {
      name: 'بديل',
      email: mail('replacement'),
      password,
      role: SystemRole.Instructor,
    });
    const session = await addSession({ at: new Date(now.getTime() + 50 * 60_000), name: 'تغيير' });
    await prisma.unscoped.session.update({
      where: { id: session.id },
      data: { instructorId: replacement },
    });
    await job.remindAll();
    expect((await notes(instructorId)).some((note) => note.body.includes('تغيير'))).toBe(false);
    const sent = await notes(replacement);
    expect(sent).toHaveLength(1);
    expect((await claims(session.id))[0]?.instructorId).toBe(replacement);
  });

  it('skips a session created 20 minutes before it starts', async () => {
    now = cairo('2026-11-05T12:00:00');
    const session = await addSession({ at: new Date(now.getTime() + 20 * 60_000), name: 'متأخر' });
    await job.remindAll();
    expect(await claims(session.id)).toHaveLength(0);
  });

  it('after a 2-hour gap skips the 1-hour reminder and still sends the 1-day one', async () => {
    now = cairo('2026-11-05T12:00:00');
    const missedHour = await addSession({
      at: new Date(now.getTime() + 10 * 60_000),
      name: 'فاتت',
    });
    const day = await addSession({
      at: new Date(now.getTime() + 22 * 60 * 60_000),
      name: 'لسه',
    });
    await job.remindAll();
    expect(await claims(missedHour.id)).toHaveLength(0);
    expect(await claims(day.id)).toMatchObject([{ leadMinutes: 1440 }]);
  });

  it('names the weekday, and keeps Western digits across midnight and the Cairo fallback', async () => {
    now = cairo('2026-11-05T01:00:00');
    const thursday = await addSession({ at: cairo('2026-11-05T23:00:00'), name: 'خميس' });
    await job.remindAll();
    const crossed = (await notes(instructorId)).find((note) => note.body.includes('خميس'));
    expect(crossed?.title).toBe('تذكير: عندك حصة');
    expect(crossed?.body).toBe('جروب خميس الخميس الساعة 11:00 م');
    expect(crossed?.body).not.toContain('بكرة');
    expect(thursday.id).toBeTruthy();

    now = cairo('2026-10-30T15:00:00');
    await addSession({ at: cairo('2026-10-30T15:40:00'), name: 'بعدها' });
    await job.remindAll();
    expect((await notes(instructorId)).some((note) => note.body.includes('3:40 م'))).toBe(true);

    now = cairo('2026-10-29T23:00:00');
    await addSession({ at: cairo('2026-10-29T23:40:00'), name: 'الرجوع' });
    await job.remindAll();
    expect((await notes(instructorId)).some((note) => note.body.includes('11:40 م'))).toBe(true);
    expect((await notes(instructorId)).some((note) => /[٠-٩]/.test(note.body))).toBe(false);
  });

  it('does not write another academy’s reminder into this academy', async () => {
    now = cairo('2026-11-05T12:00:00');
    const foreign = await addSession({
      at: new Date(now.getTime() + 50 * 60_000),
      academy: otherAcademyId,
      instructor: otherInstructorId,
      name: 'هناك',
    });
    await job.remindAll();
    const row = (await claims(foreign.id))[0];
    expect(row?.academyId).toBe(otherAcademyId);
    expect((await notes(instructorId)).some((note) => note.body.includes('هناك'))).toBe(false);
    expect(await notes(otherInstructorId)).toHaveLength(1);
  });

  it('keeps going when one academy throws', async () => {
    now = cairo('2026-11-05T12:00:00');
    const session = await addSession({ at: new Date(now.getTime() + 45 * 60_000), name: 'يكمل' });
    const original = reminders.listDue.bind(reminders);
    const spy = jest.spyOn(reminders, 'listDue').mockImplementation(() => {
      if (tenant.requireAcademyId() === otherAcademyId) return Promise.reject(new Error('bug'));
      return original();
    });
    try {
      await job.remindAll();
    } finally {
      spy.mockRestore();
    }
    expect(await claims(session.id)).toHaveLength(1);
  });

  it('sends the 50 earliest sessions and leaves the latest for the next run', async () => {
    now = cairo('2026-11-06T12:00:00');
    const ids: string[] = [];
    for (let index = 0; index < REMINDERS_PER_RUN + 1; index += 1) {
      const session = await addSession({
        at: new Date(now.getTime() + (31 * 60 + index) * 1000),
        name: `دفعة ${index}`,
      });
      ids.push(session.id);
    }
    await job.remindAll();
    const sent = await prisma.unscoped.sessionReminder.findMany({
      where: { sessionId: { in: ids } },
    });
    expect(sent).toHaveLength(REMINDERS_PER_RUN);
    expect(sent.map((row) => row.sessionId)).not.toContain(ids[ids.length - 1]);
    expect(sent.map((row) => row.sessionId)).toContain(ids[0]);
  });

  it('does not notify again when the lead is already claimed', async () => {
    now = cairo('2026-11-07T12:00:00');
    const session = await addSession({ at: new Date(now.getTime() + 50 * 60_000), name: 'مرة' });
    const due = (await tenant.run(academyId, () => reminders.listDue())).find(
      (reminder) => reminder.id === session.id,
    );
    if (!due) throw new Error('The session was not due');
    await expect(tenant.run(academyId, () => reminders.sendOne(due))).resolves.toBe(true);
    await expect(tenant.run(academyId, () => reminders.sendOne(due))).resolves.toBe(false);
    expect((await notes(instructorId)).filter((note) => note.body.includes('مرة'))).toHaveLength(1);
  });
});
