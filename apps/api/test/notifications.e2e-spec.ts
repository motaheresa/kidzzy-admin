import type { INestApplication } from '@nestjs/common';
import { NotificationType, type AppNotification, type Page } from '@kidzzy/shared';
import request from 'supertest';
import type { App } from 'supertest/types';
import { NotificationsService } from '../src/modules/notifications/notifications.service';
import { PushSubscriptionRepository } from '../src/modules/notifications/push-subscription.repository';
import {
  PushRejectedError,
  type PushMessage,
  type PushTarget,
} from '../src/modules/notifications/push-sender';
import { ReminderDelivery } from '../src/modules/notifications/reminder.delivery';
import { ReminderJob } from '../src/modules/notifications/reminder.job';
import { PrismaService } from '../src/modules/prisma/prisma.service';
import { TenantContext } from '../src/modules/tenancy/tenant-context';
import { createAcademy, createTestApp, createUser, readCookies, removeAcademy } from './helpers';

// TS-02. The tick is called directly (deliverDue). Nothing in here waits for @Interval.

class FakePush {
  calls: PushTarget[] = [];
  status: number | undefined;
  boom = false;
  delayMs = 0;

  async send(target: PushTarget, message: PushMessage): Promise<void> {
    void message;
    this.calls.push(target);
    if (this.delayMs > 0) await new Promise((resolve) => setTimeout(resolve, this.delayMs));
    if (this.boom && target.endpoint.includes('boom')) throw new Error('down');
    if (this.status) throw new PushRejectedError(this.status);
  }

  reset(): void {
    this.calls = [];
    this.status = undefined;
    this.boom = false;
    this.delayMs = 0;
  }
}

describe('Notifications and the reminder tick (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let notifications: NotificationsService;
  let tick: ReminderJob;
  let delivery: ReminderDelivery;
  let tenant: TenantContext;
  let subscriptions: PushSubscriptionRepository;
  const push = new FakePush();
  let academyId: string;
  let otherAcademyId: string;
  let mona: string;
  let nour: string;
  let otherUser: string;
  let monaToken: string;
  let nourToken: string;
  let otherToken: string;
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
    app = await createTestApp({ loginRateLimit: 1000, pushSender: push });
    prisma = app.get(PrismaService);
    notifications = app.get(NotificationsService);
    tick = app.get(ReminderJob);
    delivery = app.get(ReminderDelivery);
    tenant = app.get(TenantContext);
    subscriptions = app.get(PushSubscriptionRepository);
    academyId = await createAcademy(prisma, 'notes');
    otherAcademyId = await createAcademy(prisma, 'notes-other');
    mona = await createUser(prisma, academyId, {
      name: 'Mona',
      email: mail('mona'),
      password,
      role: 'Admin',
    });
    nour = await createUser(prisma, academyId, {
      name: 'Nour',
      email: mail('nour'),
      password,
      role: 'Instructor',
    });
    otherUser = await createUser(prisma, otherAcademyId, {
      name: 'Other',
      email: mail('other'),
      password,
      role: 'Admin',
    });
    monaToken = await login(mail('mona'));
    nourToken = await login(mail('nour'));
    otherToken = await login(mail('other'));
  });

  afterAll(async () => {
    await removeAcademy(prisma, academyId);
    await removeAcademy(prisma, otherAcademyId);
    await app.close();
  });

  beforeEach(() => push.reset());

  /** Job tests share one database, so each one starts with no due work of its own. */
  async function clearUnsent(): Promise<void> {
    await prisma.unscoped.reminderJob.deleteMany({
      where: { academyId: { in: [academyId, otherAcademyId] }, sentAt: null },
    });
  }

  /** A failed job waits before its next try. Tests that retry move it back into the past. */
  async function makeDue(): Promise<void> {
    await prisma.unscoped.reminderJob.updateMany({
      where: { academyId: { in: [academyId, otherAcademyId] }, sentAt: null },
      data: { runAt: new Date(Date.now() - 1000) },
    });
  }

  const jobOf = (notificationId: string) =>
    prisma.unscoped.reminderJob.findFirstOrThrow({
      where: { payload: { path: ['notificationId'], equals: notificationId } },
    });

  function device(endpoint: string) {
    return { endpoint, keys: { p256dh: 'key', auth: 'auth' }, userAgent: 'Test' };
  }

  async function notify(userId: string, title: string, academy = academyId) {
    return tenant.run(academy, () =>
      notifications.notify(userId, {
        type: NotificationType.SessionReminder,
        title,
        body: 'body',
        data: { url: '/groups/1' },
      }),
    );
  }

  it('lists newest first, pages, counts unread, and marks one and all read', async () => {
    const older = await notify(mona, 'older');
    const newer = await notify(mona, 'newer');
    await prisma.unscoped.notification.update({
      where: { id: older.id },
      data: { createdAt: new Date('2026-10-01T00:00:00.000Z') },
    });

    const page = await request(server())
      .get(api('/notifications?page=1&pageSize=1'))
      .set(as(monaToken))
      .expect(200);
    const body = page.body as Page<AppNotification>;
    expect(body.data.map((row) => row.title)).toEqual(['newer']);
    expect(body.meta.total).toBeGreaterThanOrEqual(2);

    const unread = await request(server())
      .get(api('/notifications?unread=true&pageSize=100'))
      .set(as(monaToken))
      .expect(200);
    expect((unread.body as Page<AppNotification>).data.every((row) => row.readAt === null)).toBe(
      true,
    );

    const count = await request(server())
      .get(api('/notifications/unread-count'))
      .set(as(monaToken))
      .expect(200);
    const before = (count.body as { count: number }).count;

    await request(server())
      .post(api(`/notifications/${newer.id}/read`))
      .set(as(monaToken))
      .expect(204);
    const afterOne = await request(server())
      .get(api('/notifications/unread-count'))
      .set(as(monaToken))
      .expect(200);
    expect((afterOne.body as { count: number }).count).toBe(before - 1);

    await request(server()).post(api('/notifications/read-all')).set(as(monaToken)).expect(204);
    const afterAll = await request(server())
      .get(api('/notifications/unread-count'))
      .set(as(monaToken))
      .expect(200);
    expect((afterAll.body as { count: number }).count).toBe(0);
  });

  it('returns 404 when another user or another academy marks or deletes', async () => {
    const note = await notify(mona, 'private');
    const saved = await request(server())
      .post(api('/push-subscriptions'))
      .set(as(monaToken))
      .send(device('https://push.example/mona'))
      .expect(201);
    const subscriptionId = (saved.body as { id: string }).id;
    expect(Object.keys(saved.body as object).sort()).toEqual(['createdAt', 'id', 'userAgent']);

    await request(server())
      .post(api(`/notifications/${note.id}/read`))
      .set(as(nourToken))
      .expect(404);
    await request(server())
      .post(api(`/notifications/${note.id}/read`))
      .set(as(otherToken))
      .expect(404);
    await request(server())
      .delete(api(`/push-subscriptions/${subscriptionId}`))
      .set(as(nourToken))
      .expect(404);
    await request(server())
      .delete(api(`/push-subscriptions/${subscriptionId}`))
      .set(as(otherToken))
      .expect(404);
  });

  it('replaces another academy subscription and updates one in the same academy', async () => {
    const endpoint = 'https://push.example/shared-browser';
    await request(server())
      .post(api('/push-subscriptions'))
      .set(as(otherToken))
      .send(device(endpoint))
      .expect(201);
    const foreign = await subscriptions.findAcademyByEndpoint(endpoint);
    expect(foreign && Object.keys(foreign).sort()).toEqual(['academyId', 'id']);
    expect(foreign?.academyId).toBe(otherAcademyId);

    await request(server())
      .post(api('/push-subscriptions'))
      .set(as(monaToken))
      .send(device(endpoint))
      .expect(201);
    const moved = await prisma.unscoped.pushSubscription.findUniqueOrThrow({ where: { endpoint } });
    expect(moved.academyId).toBe(academyId);
    expect(moved.userId).toBe(mona);

    await request(server())
      .post(api('/push-subscriptions'))
      .set(as(nourToken))
      .send(device(endpoint))
      .expect(201);
    const updated = await prisma.unscoped.pushSubscription.findUniqueOrThrow({
      where: { endpoint },
    });
    expect(updated.academyId).toBe(academyId);
    expect(updated.userId).toBe(nour);
    expect(await prisma.unscoped.pushSubscription.count({ where: { endpoint } })).toBe(1);
  });

  it('writes a notification and a job without calling the push service', async () => {
    const created = await notify(mona, 'queued');
    expect(push.calls).toHaveLength(0);
    const job = await prisma.unscoped.reminderJob.findFirst({
      where: { academyId, payload: { path: ['notificationId'], equals: created.id } },
    });
    expect(job?.sentAt).toBeNull();
    expect(job?.kind).toBe('notification.push');
  });

  it('sends a due job, drops a 410 subscription, and retries a failure five times', async () => {
    await request(server())
      .post(api('/push-subscriptions'))
      .set(as(monaToken))
      .send(device('https://push.example/live'))
      .expect(201);
    const created = await notify(mona, 'deliver me');
    await tick.deliverDue();
    expect(push.calls.length).toBeGreaterThan(0);
    const sent = await prisma.unscoped.reminderJob.findFirstOrThrow({
      where: { payload: { path: ['notificationId'], equals: created.id } },
    });
    expect(sent.sentAt).not.toBeNull();

    await request(server())
      .post(api('/push-subscriptions'))
      .set(as(monaToken))
      .send(device('https://push.example/gone'))
      .expect(201);
    push.reset();
    push.status = 410;
    const gone = await notify(mona, 'gone');
    await tick.deliverDue();
    expect(
      await prisma.unscoped.pushSubscription.findUnique({
        where: { endpoint: 'https://push.example/gone' },
      }),
    ).toBeNull();
    const goneJob = await prisma.unscoped.reminderJob.findFirstOrThrow({
      where: { payload: { path: ['notificationId'], equals: gone.id } },
    });
    expect(goneJob.sentAt).not.toBeNull();

    await clearUnsent();
    await prisma.unscoped.pushSubscription.deleteMany({ where: { userId: mona } });
    await request(server())
      .post(api('/push-subscriptions'))
      .set(as(monaToken))
      .send(device('https://push.example/retry'))
      .expect(201);
    push.reset();
    push.status = 500;
    const retry = await notify(mona, 'retry');
    for (let attempt = 0; attempt < 5; attempt += 1) {
      await makeDue();
      await tick.deliverDue();
    }
    const retryCalls = () =>
      push.calls.filter((call) => call.endpoint === 'https://push.example/retry');
    expect(retryCalls()).toHaveLength(5);
    const callsAfterLimit = push.calls.length;
    await makeDue();
    await tick.deliverDue();
    expect(push.calls).toHaveLength(callsAfterLimit);
    expect(retryCalls()).toHaveLength(5);
    const retryJob = await prisma.unscoped.reminderJob.findFirstOrThrow({
      where: { payload: { path: ['notificationId'], equals: retry.id } },
    });
    expect(retryJob.sentAt).toBeNull();
    expect(retryJob.attempts).toBe(5);
  });

  it('sends at most 50 jobs per academy in one tick', async () => {
    await clearUnsent();
    for (let index = 0; index < 51; index += 1) await notify(nour, `n${index}`);
    push.reset();
    await tick.deliverDue();
    const unsent = await prisma.unscoped.reminderJob.count({
      where: { academyId, sentAt: null, attempts: { lt: 5 } },
    });
    expect(unsent).toBe(1);
  });

  it('does not send the same job twice when two ticks overlap', async () => {
    await prisma.unscoped.reminderJob.deleteMany({ where: { academyId, sentAt: null } });
    await request(server())
      .post(api('/push-subscriptions'))
      .set(as(monaToken))
      .send(device('https://push.example/once'))
      .expect(201);
    await notify(mona, 'once');
    push.reset();
    push.delayMs = 200;
    await Promise.all([tick.deliverDue(), tick.deliverDue()]);
    const once = push.calls.filter((call) => call.endpoint === 'https://push.example/once');
    expect(once).toHaveLength(1);
  });

  it('records a timeout and still sends the next job of the same academy in one tick', async () => {
    await clearUnsent();
    await prisma.unscoped.pushSubscription.deleteMany({ where: { userId: { in: [mona, nour] } } });
    await request(server())
      .post(api('/push-subscriptions'))
      .set(as(monaToken))
      .send(device('https://push.example/boom-slow'))
      .expect(201);
    await request(server())
      .post(api('/push-subscriptions'))
      .set(as(nourToken))
      .send(device('https://push.example/next'))
      .expect(201);
    const stuck = await notify(mona, 'stuck');
    const next = await notify(nour, 'next');
    push.reset();
    push.boom = true;
    await tick.deliverDue();
    const stuckJob = await jobOf(stuck.id);
    expect(stuckJob.sentAt).toBeNull();
    expect(stuckJob.attempts).toBe(1);
    expect(stuckJob.lastError).toBe('Error');
    expect((await jobOf(next.id)).sentAt).not.toBeNull();
    // The failed job is no longer first in line: a second tick does not call it again.
    push.calls = [];
    await tick.deliverDue();
    expect(push.calls).toHaveLength(0);
  });

  it('moves run_at forward by 1, 5, 15 and 60 minutes and stops at the limit', async () => {
    await clearUnsent();
    await prisma.unscoped.pushSubscription.deleteMany({ where: { userId: mona } });
    await request(server())
      .post(api('/push-subscriptions'))
      .set(as(monaToken))
      .send(device('https://push.example/boom-backoff'))
      .expect(201);
    const created = await notify(mona, 'backoff');
    push.reset();
    push.boom = true;
    for (const minutes of [1, 5, 15, 60]) {
      await makeDue();
      const before = Date.now();
      await tick.deliverDue();
      const job = await jobOf(created.id);
      const waited = (job.runAt.getTime() - before) / 60_000;
      expect(waited).toBeGreaterThan(minutes - 0.5);
      expect(waited).toBeLessThan(minutes + 0.5);
    }
    await makeDue();
    await tick.deliverDue();
    const last = await jobOf(created.id);
    expect(last.attempts).toBe(5);
    expect(last.sentAt).toBeNull();
    expect(last.lastError).toBe('Error');
    push.calls = [];
    await makeDue();
    await tick.deliverDue();
    expect(push.calls).toHaveLength(0);
  });

  it('retries only the subscriptions that failed', async () => {
    await clearUnsent();
    await prisma.unscoped.pushSubscription.deleteMany({ where: { userId: mona } });
    for (const name of ['good', 'boom-retry']) {
      await request(server())
        .post(api('/push-subscriptions'))
        .set(as(monaToken))
        .send(device(`https://push.example/${name}`))
        .expect(201);
    }
    const created = await notify(mona, 'partial');
    push.reset();
    push.boom = true;
    await tick.deliverDue();
    expect(push.calls.map((call) => call.endpoint).sort()).toEqual([
      'https://push.example/boom-retry',
      'https://push.example/good',
    ]);
    expect((await jobOf(created.id)).sentAt).toBeNull();

    push.calls = [];
    push.boom = false;
    await makeDue();
    await tick.deliverDue();
    expect(push.calls.map((call) => call.endpoint)).toEqual(['https://push.example/boom-retry']);
    expect((await jobOf(created.id)).sentAt).not.toBeNull();
  });

  it('keeps going when one academy throws', async () => {
    await clearUnsent();
    await notify(otherUser, 'broken', otherAcademyId);
    const fine = await notify(mona, 'fine');
    const original = delivery.deliverOne.bind(delivery);
    const spy = jest.spyOn(delivery, 'deliverOne').mockImplementation(() => {
      if (tenant.requireAcademyId() === otherAcademyId) return Promise.reject(new Error('bug'));
      return original();
    });
    try {
      await tick.deliverDue();
    } finally {
      spy.mockRestore();
    }
    expect((await jobOf(fine.id)).sentAt).not.toBeNull();
  });
});
