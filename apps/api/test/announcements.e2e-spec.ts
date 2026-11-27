import { randomUUID } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import type { INestApplication } from '@nestjs/common';
import {
  ErrorCode,
  SystemRole,
  type Announcement,
  type AudienceRole,
  type AudienceUser,
  type Page,
} from '@kidzzy/shared';
import request from 'supertest';
import type { App } from 'supertest/types';
import { ReminderJobRepository } from '../src/modules/notifications/reminder-job.repository';
import { PrismaService } from '../src/modules/prisma/prisma.service';
import { createAcademy, createTestApp, createUser, readCookies, removeAcademy } from './helpers';

// US-31 (SCRUM-51): the admin sends an announcement to everyone, to a role or to chosen people.
// The push itself is the notification tick's job (notifications.e2e-spec.ts); here each recipient
// must get exactly one notification row and one push job.

interface Setup {
  academyId: string;
  admin: string;
  ana: string;
  adminId: string;
  anaId: string;
  omarId: string;
  saraId: string;
  goneId: string;
  adminRoleId: string;
  instructorRoleId: string;
}

describe('Announcements (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  const academies: string[] = [];
  const password = 'correct-horse-1';
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  const mail = (name: string, label: string) => `${name}-${label}-${stamp}@test.local`;

  const server = () => app.getHttpServer();
  const api = (path: string) => `/api/v1${path}`;
  const as = (token: string) => ({ Cookie: `access_token=${token}` });

  async function signIn(email: string): Promise<string> {
    const res = await request(server())
      .post(api('/auth/login'))
      .send({ login: email, password })
      .expect(200);
    return readCookies(res.headers['set-cookie']).access_token.value;
  }

  const roleId = async (academyId: string, name: string) =>
    (
      await prisma.unscoped.role.findUniqueOrThrow({
        where: { academyId_name: { academyId, name } },
      })
    ).id;

  /**
   * An academy with the sending admin, a second admin (sara), two active instructors (ana, omar)
   * and a deactivated instructor (gone).
   */
  async function setup(label: string): Promise<Setup> {
    const academyId = await createAcademy(prisma, `announcements-${label}`);
    academies.push(academyId);
    const user = (name: string, role: SystemRole, isActive = true) =>
      createUser(prisma, academyId, {
        name,
        email: mail(name, label),
        password,
        role,
        isActive,
      });
    const adminId = await user('admin', SystemRole.Admin);
    const saraId = await user('sara', SystemRole.Admin);
    const anaId = await user('ana', SystemRole.Instructor);
    const omarId = await user('omar', SystemRole.Instructor);
    const goneId = await user('gone', SystemRole.Instructor, false);
    return {
      academyId,
      adminId,
      saraId,
      anaId,
      omarId,
      goneId,
      admin: await signIn(mail('admin', label)),
      ana: await signIn(mail('ana', label)),
      adminRoleId: await roleId(academyId, SystemRole.Admin),
      instructorRoleId: await roleId(academyId, SystemRole.Instructor),
    };
  }

  const message = { title: 'Holiday', body: 'No sessions on Thursday.' };

  const send = (token: string, body: object) =>
    request(server()).post(api('/announcements')).set(as(token)).send(body);

  const countFor = (token: string, query: string) =>
    request(server())
      .get(api(`/announcements/recipients-count?${query}`))
      .set(as(token));

  const list = async (token: string, query = '') =>
    (
      await request(server())
        .get(api(`/announcements${query}`))
        .set(as(token))
        .expect(200)
    ).body as Page<Announcement>;

  const notificationsOf = (academyId: string) =>
    prisma.unscoped.notification.findMany({ where: { academyId } });

  const recipientsOf = async (academyId: string) =>
    (await notificationsOf(academyId)).map((row) => row.userId).sort();

  beforeAll(async () => {
    app = await createTestApp({ loginRateLimit: 1000 });
    prisma = app.get(PrismaService);
  });

  afterAll(async () => {
    for (const academyId of academies) await removeAcademy(prisma, academyId);
    await app.close();
  });

  describe('sending', () => {
    it('all: every active user but the sender, with one notification and one push job each', async () => {
      const s = await setup('all');
      const res = await send(s.admin, {
        title: '  Holiday  ',
        body: '  No sessions on Thursday.  ',
        audience: 'all',
      }).expect(201);

      const announcement = res.body as Announcement;
      expect(announcement).toEqual({
        id: expect.any(String) as string,
        ...message,
        audience: 'all',
        roleId: null,
        roleName: null,
        recipientCount: 3,
        sender: { id: s.adminId, name: 'admin' },
        createdAt: expect.any(String) as string,
      });
      expect(await recipientsOf(s.academyId)).toEqual([s.saraId, s.anaId, s.omarId].sort());

      const rows = await notificationsOf(s.academyId);
      for (const row of rows) {
        expect(row).toMatchObject({
          type: 'announcement',
          ...message,
          data: { url: '/notifications', announcementId: announcement.id },
          readAt: null,
        });
      }
      const jobs = await prisma.unscoped.reminderJob.findMany({
        where: { academyId: s.academyId },
      });
      expect(jobs.map((job) => job.kind)).toEqual(Array(3).fill('notification.push'));
      expect(jobs.map((job) => job.payload)).toEqual(
        expect.arrayContaining(rows.map((row) => ({ notificationId: row.id }))),
      );
      // Nothing is pushed inside the request: the tick does it.
      expect(jobs.every((job) => job.sentAt === null)).toBe(true);
    });

    it('role: the active users who hold the role, without the sender', async () => {
      const s = await setup('role');
      const toInstructors = await send(s.admin, {
        ...message,
        audience: 'role',
        roleId: s.instructorRoleId,
      }).expect(201);
      expect(toInstructors.body).toMatchObject({
        audience: 'role',
        roleId: s.instructorRoleId,
        roleName: 'Instructor',
        recipientCount: 2,
      });
      expect(await recipientsOf(s.academyId)).toEqual([s.anaId, s.omarId].sort());

      const toAdmins = await send(s.admin, {
        ...message,
        audience: 'role',
        roleId: s.adminRoleId,
      }).expect(201);
      expect(toAdmins.body).toMatchObject({ roleName: 'Admin', recipientCount: 1 });
    });

    it("role: another academy's role and an unknown one are 422 on roleId", async () => {
      const s = await setup('role-bad');
      const other = await setup('role-other');
      for (const id of [other.instructorRoleId, randomUUID()]) {
        const res = await send(s.admin, { ...message, audience: 'role', roleId: id }).expect(422);
        expect(res.body).toMatchObject({
          code: ErrorCode.ValidationFailed,
          errors: [{ field: 'roleId' }],
        });
        await countFor(s.admin, `audience=role&roleId=${id}`).expect(422);
      }
      expect(await notificationsOf(s.academyId)).toEqual([]);
      expect(await notificationsOf(other.academyId)).toEqual([]);
    });

    it('users: exactly the chosen people, the sender removed', async () => {
      const s = await setup('users');
      const res = await send(s.admin, {
        ...message,
        audience: 'users',
        userIds: [s.anaId.toUpperCase(), s.saraId, s.adminId],
      }).expect(201);
      expect(res.body).toMatchObject({ audience: 'users', roleId: null, recipientCount: 2 });
      expect(await recipientsOf(s.academyId)).toEqual([s.anaId, s.saraId].sort());
    });

    it("users: an inactive, unknown or another academy's user is 422 on userIds, and nothing is sent", async () => {
      const s = await setup('users-bad');
      const other = await setup('users-other');
      for (const bad of [s.goneId, randomUUID(), other.anaId]) {
        const res = await send(s.admin, {
          ...message,
          audience: 'users',
          userIds: [s.anaId, bad],
        }).expect(422);
        expect(res.body).toMatchObject({
          code: ErrorCode.ValidationFailed,
          errors: [{ field: 'userIds' }],
        });
        await countFor(s.admin, `audience=users&userIds=${s.anaId},${bad}`).expect(422);
      }
      expect(await notificationsOf(s.academyId)).toEqual([]);
      expect(await notificationsOf(other.academyId)).toEqual([]);
      expect((await list(s.admin)).data).toEqual([]);
    });

    it('an audience with nobody left is 422 ANNOUNCEMENT_NO_RECIPIENTS', async () => {
      const s = await setup('nobody');
      // Only the sender holds the Admin role from here on.
      await prisma.unscoped.user.update({ where: { id: s.saraId }, data: { isActive: false } });

      const attempts = [
        { audience: 'role', roleId: s.adminRoleId },
        { audience: 'users', userIds: [s.adminId] },
      ];
      for (const audience of attempts) {
        const res = await send(s.admin, { ...message, ...audience }).expect(422);
        expect(res.body).toMatchObject({ code: ErrorCode.AnnouncementNoRecipients });
      }
      await prisma.unscoped.user.updateMany({
        where: { academyId: s.academyId, id: { not: s.adminId } },
        data: { isActive: false },
      });
      const res = await send(s.admin, { ...message, audience: 'all' }).expect(422);
      expect(res.body).toMatchObject({ code: ErrorCode.AnnouncementNoRecipients });
      const counted = await countFor(s.admin, 'audience=all').expect(422);
      expect(counted.body).toMatchObject({ code: ErrorCode.AnnouncementNoRecipients });

      expect((await list(s.admin)).data).toEqual([]);
      expect(await notificationsOf(s.academyId)).toEqual([]);
    });

    it('a failure for one recipient rolls the whole send back', async () => {
      const s = await setup('rollback');
      const jobs = app.get(ReminderJobRepository);
      const enqueue = jobs.enqueue.bind(jobs);
      const spy = jest
        .spyOn(jobs, 'enqueue')
        .mockImplementationOnce(enqueue)
        .mockRejectedValueOnce(new Error('the second recipient fails'));
      try {
        await send(s.admin, { ...message, audience: 'all' }).expect(500);
        expect(spy).toHaveBeenCalledTimes(2);
      } finally {
        spy.mockRestore();
      }

      const where = { academyId: s.academyId };
      expect(await prisma.unscoped.announcement.count({ where })).toBe(0);
      expect(await prisma.unscoped.notification.count({ where })).toBe(0);
      expect(await prisma.unscoped.reminderJob.count({ where })).toBe(0);
      expect(
        await prisma.unscoped.auditLog.count({
          where: { ...where, action: 'announcement.sent' },
        }),
      ).toBe(0);
    });

    it('is audited with the title, the audience, the ids and the count', async () => {
      const s = await setup('audit');
      const toUsers = (
        await send(s.admin, { ...message, audience: 'users', userIds: [s.anaId] }).expect(201)
      ).body as Announcement;
      const toRole = (
        await send(s.admin, {
          ...message,
          audience: 'role',
          roleId: s.instructorRoleId,
          // Ignored for this audience, and not stored.
          userIds: [s.saraId],
        }).expect(201)
      ).body as Announcement;

      const entryOf = (entityId: string) =>
        prisma.unscoped.auditLog.findFirstOrThrow({
          where: { academyId: s.academyId, action: 'announcement.sent', entityId },
        });
      expect(await entryOf(toUsers.id)).toMatchObject({
        actorId: s.adminId,
        entityType: 'announcements',
      });
      expect((await entryOf(toUsers.id)).after).toEqual({
        title: message.title,
        audience: 'users',
        userIds: [s.anaId],
        recipientCount: 1,
      });
      expect((await entryOf(toRole.id)).after).toEqual({
        title: message.title,
        audience: 'role',
        roleId: s.instructorRoleId,
        recipientCount: 2,
      });
    });
  });

  describe('validation', () => {
    it('refuses empty or too long texts after trimming, and a bad audience, with 400', async () => {
      const s = await setup('validation');
      const valid = { ...message, audience: 'all' };
      const bad: [object, string][] = [
        [{ title: '   ' }, 'title'],
        [{ title: 'x'.repeat(101) }, 'title'],
        // 51 hearts are 102 characters to the browser and the database, not 51.
        [{ title: '❤️'.repeat(51) }, 'title'],
        [{ body: '' }, 'body'],
        [{ body: 'x'.repeat(1001) }, 'body'],
        [{ audience: 'everyone' }, 'audience'],
        [{ audience: 'role' }, 'roleId'],
        [{ audience: 'users' }, 'userIds'],
        [{ audience: 'users', userIds: [] }, 'userIds'],
        [{ audience: 'users', userIds: ['not-an-id'] }, 'userIds'],
        [{ audience: 'users', userIds: [s.anaId, s.anaId] }, 'userIds'],
        [
          { audience: 'users', userIds: Array.from({ length: 201 }, () => randomUUID()) },
          'userIds',
        ],
      ];
      for (const [change, field] of bad) {
        const res = await send(s.admin, { ...valid, ...change }).expect(400);
        expect(res.body).toMatchObject({
          code: ErrorCode.ValidationFailed,
          errors: expect.arrayContaining([expect.objectContaining({ field })]) as unknown,
        });
      }
      await countFor(s.admin, 'audience=role').expect(400);
      await countFor(s.admin, 'audience=users').expect(400);
      const tooMany = Array.from({ length: 201 }, () => randomUUID()).join(',');
      await countFor(s.admin, `audience=users&userIds=${tooMany}`).expect(400);
      expect(await notificationsOf(s.academyId)).toEqual([]);
    });

    it('accepts texts of exactly the limits', async () => {
      const s = await setup('limits');
      await send(s.admin, {
        title: ` ${'❤️'.repeat(50)} `,
        body: 'x'.repeat(1000),
        audience: 'all',
      }).expect(201);
    });
  });

  describe('the recipients count', () => {
    it('is the number a send with the same audience then delivers', async () => {
      const s = await setup('count');
      const audiences: { query: string; body: object; count: number }[] = [
        { query: 'audience=all', body: { audience: 'all' }, count: 3 },
        {
          query: `audience=role&roleId=${s.instructorRoleId}`,
          body: { audience: 'role', roleId: s.instructorRoleId },
          count: 2,
        },
        {
          query: `audience=users&userIds=${s.anaId},${s.adminId}`,
          body: { audience: 'users', userIds: [s.anaId, s.adminId] },
          count: 1,
        },
        {
          query: `audience=users&userIds=${s.anaId}&userIds=${s.omarId}`,
          body: { audience: 'users', userIds: [s.anaId, s.omarId] },
          count: 2,
        },
      ];
      for (const audience of audiences) {
        const counted = await countFor(s.admin, audience.query).expect(200);
        expect(counted.body).toEqual({ count: audience.count });
        const sent = await send(s.admin, { ...message, ...audience.body }).expect(201);
        expect((sent.body as Announcement).recipientCount).toBe(audience.count);
      }
      expect(await notificationsOf(s.academyId)).toHaveLength(3 + 2 + 1 + 2);
    });
  });

  describe('the sent list', () => {
    it("is newest first and paginated, and holds only this academy's", async () => {
      const s = await setup('list');
      const other = await setup('list-other');
      await send(s.admin, { ...message, title: 'first', audience: 'all' }).expect(201);
      await send(s.admin, {
        ...message,
        title: 'second',
        audience: 'role',
        roleId: s.instructorRoleId,
      }).expect(201);
      await send(other.admin, { ...message, title: 'theirs', audience: 'all' }).expect(201);

      const all = await list(s.admin);
      expect(all.meta).toEqual({ page: 1, pageSize: 20, total: 2 });
      expect(all.data.map((row) => row.title)).toEqual(['second', 'first']);
      expect(all.data[0]).toMatchObject({
        audience: 'role',
        roleName: 'Instructor',
        recipientCount: 2,
        sender: { id: s.adminId, name: 'admin' },
      });

      const second = await list(s.admin, '?page=2&pageSize=1');
      expect(second.meta).toEqual({ page: 2, pageSize: 1, total: 2 });
      expect(second.data.map((row) => row.title)).toEqual(['first']);
    });
  });

  describe('the audience pickers', () => {
    it("lists this academy's roles", async () => {
      const s = await setup('roles');
      const res = await request(server())
        .get(api('/announcements/audience/roles'))
        .set(as(s.admin))
        .expect(200);
      expect(res.body as AudienceRole[]).toEqual([
        { id: s.adminRoleId, name: 'Admin' },
        { id: s.instructorRoleId, name: 'Instructor' },
      ]);
    });

    it('lists the active users without the caller, searched and paginated', async () => {
      const s = await setup('picker');
      await setup('picker-other');
      const people = async (query: string) =>
        (
          await request(server())
            .get(api(`/announcements/audience/users${query}`))
            .set(as(s.admin))
            .expect(200)
        ).body as Page<AudienceUser>;

      const all = await people('');
      expect(all.meta.total).toBe(3);
      expect(all.data).toEqual([
        { id: s.anaId, name: 'ana', roles: ['Instructor'] },
        { id: s.omarId, name: 'omar', roles: ['Instructor'] },
        { id: s.saraId, name: 'sara', roles: ['Admin'] },
      ]);
      expect((await people('?search=OMA')).data.map((user) => user.id)).toEqual([s.omarId]);
      expect((await people('?search=sara-picker-')).data.map((user) => user.id)).toEqual([
        s.saraId,
      ]);
      // Wildcards are literal text.
      expect((await people('?search=%25')).data).toEqual([]);
      expect((await people('?search=_')).data).toEqual([]);

      const page = await people('?page=2&pageSize=2');
      expect(page.meta).toEqual({ page: 2, pageSize: 2, total: 3 });
      expect(page.data.map((user) => user.id)).toEqual([s.saraId]);
    });
  });

  describe('access', () => {
    it('is only for announcements.send: 403 for an instructor, 401 without a login', async () => {
      const s = await setup('access');
      const gets = [
        '/announcements',
        '/announcements/recipients-count?audience=all',
        '/announcements/audience/roles',
        '/announcements/audience/users',
      ];
      for (const path of gets) {
        await request(server()).get(api(path)).set(as(s.ana)).expect(403);
        await request(server()).get(api(path)).expect(401);
      }
      await send(s.ana, { ...message, audience: 'all' }).expect(403);
      await request(server())
        .post(api('/announcements'))
        .send({ ...message, audience: 'all' })
        .expect(401);
      expect(await notificationsOf(s.academyId)).toEqual([]);
    });
  });

  describe('the migration', () => {
    const permissionSql = () => {
      const dir = join(__dirname, '..', 'prisma', 'migrations');
      const folder = readdirSync(dir).find((name) => name.endsWith('_announcements'));
      if (!folder) throw new Error('migration not found');
      const sql = readFileSync(join(dir, folder, 'migration.sql'), 'utf8');
      return sql.slice(sql.indexOf('-- The permission to send announcements'));
    };

    it('grants announcements.send to the Admin role of an existing academy only; twice changes nothing', async () => {
      const s = await setup('migration');
      const where = {
        role: { academyId: s.academyId },
        permission: { key: 'announcements.send:any' },
      };
      await prisma.unscoped.rolePermission.deleteMany({ where });

      const statements = permissionSql()
        .split('\n')
        .filter((line) => !line.trim().startsWith('--'))
        .join('\n')
        .split(';')
        .map((statement) => statement.trim())
        .filter(Boolean);
      expect(statements).toHaveLength(2);
      for (let run = 0; run < 2; run += 1) {
        for (const statement of statements) await prisma.unscoped.$executeRawUnsafe(statement);
      }

      const granted = await prisma.unscoped.rolePermission.findMany({ where });
      expect(granted.map((row) => row.roleId)).toEqual([s.adminRoleId]);
    });
  });
});
