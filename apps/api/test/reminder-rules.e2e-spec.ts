import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { INestApplication } from '@nestjs/common';
import {
  DEFAULT_REMINDER_RULES,
  ErrorCode,
  ReminderRuleType,
  SystemRole,
  type ReminderRule,
} from '@kidzzy/shared';
import request from 'supertest';
import type { App } from 'supertest/types';
import { seedReminderRules } from '../prisma/seed/access.seed';
import { PrismaService } from '../src/modules/prisma/prisma.service';
import { createAcademy, createTestApp, createUser, readCookies, removeAcademy } from './helpers';

// US-30 (SCRUM-47): the reminder rules.

const password = 'correct-horse-1';

describe('Reminder rules (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let academyId: string;
  let otherAcademyId: string;
  let adminToken: string;
  let instructorToken: string;
  let otherAdminToken: string;
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  const mail = (name: string) => `${name}-${stamp}@test.local`;

  const api = (path: string) => `/api/v1${path}`;
  const as = (token: string) => ({ Cookie: `access_token=${token}` });

  async function login(loginName: string): Promise<string> {
    const res = await request(app.getHttpServer())
      .post(api('/auth/login'))
      .send({ login: loginName, password })
      .expect(200);
    return readCookies(res.headers['set-cookie']).access_token.value;
  }

  const list = async (token = adminToken): Promise<ReminderRule[]> => {
    const res = await request(app.getHttpServer())
      .get(api('/reminder-rules'))
      .set(as(token))
      .expect(200);
    return (res.body as { data: ReminderRule[] }).data;
  };
  const create = (body: object, token = adminToken) =>
    request(app.getHttpServer()).post(api('/reminder-rules')).set(as(token)).send(body);
  const audit = (action: string, entityId?: string) =>
    prisma.unscoped.auditLog.findMany({
      where: { academyId, action, ...(entityId ? { entityId } : {}) },
    });

  beforeAll(async () => {
    app = await createTestApp({ loginRateLimit: 1000 });
    prisma = app.get(PrismaService);
    academyId = await createAcademy(prisma, 'reminder-rules');
    otherAcademyId = await createAcademy(prisma, 'reminder-rules-other');
    await createUser(prisma, academyId, {
      name: 'admin',
      email: mail('admin'),
      password,
      role: SystemRole.Admin,
    });
    await createUser(prisma, academyId, {
      name: 'instructor',
      email: mail('instructor'),
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
    instructorToken = await login(mail('instructor'));
    otherAdminToken = await login(mail('other-admin'));
  });

  afterAll(async () => {
    await removeAcademy(prisma, academyId);
    await removeAcademy(prisma, otherAcademyId);
    await app.close();
  });

  describe('the defaults', () => {
    it('gives a new academy the timing that was hardcoded before', async () => {
      const rules = await list();
      const values = rules.map((rule) => ({
        type: rule.type,
        leadMinutes: rule.leadMinutes ?? undefined,
        sessionsBeforeEnd: rule.sessionsBeforeEnd ?? undefined,
      }));
      expect(values).toHaveLength(DEFAULT_REMINDER_RULES.length);
      for (const wanted of DEFAULT_REMINDER_RULES) expect(values).toContainEqual(wanted);
      expect(rules.every((rule) => rule.isActive)).toBe(true);
    });

    it('is not added again by a second seed, even after a rule was deleted', async () => {
      const [first] = await list();
      await request(app.getHttpServer())
        .delete(api(`/reminder-rules/${first.id}`))
        .set(as(adminToken))
        .expect(204);
      await seedReminderRules(prisma.unscoped, academyId);
      expect(await list()).toHaveLength(DEFAULT_REMINDER_RULES.length - 1);
      await create({
        type: first.type,
        ...(first.leadMinutes ? { leadMinutes: first.leadMinutes } : {}),
        ...(first.sessionsBeforeEnd ? { sessionsBeforeEnd: first.sessionsBeforeEnd } : {}),
      }).expect(201);
    });

    it('is what the migration inserts for an academy that already existed', async () => {
      // Replays the migration's INSERT for one academy that has no rules, so the SQL and the
      // defaults of the seed cannot drift apart.
      const migrations = join(__dirname, '..', 'prisma', 'migrations');
      const folder = readdirSync(migrations).find((name) => name.endsWith('_reminder_rules'));
      if (!folder) throw new Error('The reminder_rules migration is missing');
      const sql = readFileSync(join(migrations, folder, 'migration.sql'), 'utf8');
      const insert = sql.slice(sql.indexOf('INSERT INTO "reminder_rules"')).replace(/;\s*$/, '');
      const academy = await createAcademy(prisma, 'reminder-rules-migration');
      try {
        await prisma.unscoped.reminderRule.deleteMany({ where: { academyId: academy } });
        await prisma.unscoped.$executeRawUnsafe(`${insert} WHERE a."id" = '${academy}'::uuid`);
        const rows = await prisma.unscoped.reminderRule.findMany({ where: { academyId: academy } });
        const values = rows.map((row) => ({
          type: row.type,
          leadMinutes: row.leadMinutes ?? undefined,
          sessionsBeforeEnd: row.sessionsBeforeEnd ?? undefined,
        }));
        expect(values).toHaveLength(DEFAULT_REMINDER_RULES.length);
        for (const wanted of DEFAULT_REMINDER_RULES) expect(values).toContainEqual(wanted);
        expect(rows.every((row) => row.isActive)).toBe(true);
      } finally {
        await removeAcademy(prisma, academy);
      }
    });
  });

  describe('add', () => {
    it('adds a session rule and a payment rule, and leaves an audit entry', async () => {
      const session = await create({ type: ReminderRuleType.SessionReminder, leadMinutes: 180 });
      expect(session.status).toBe(201);
      expect({ ...(session.body as ReminderRule), id: 'id' }).toEqual({
        id: 'id',
        type: 'session_reminder',
        leadMinutes: 180,
        sessionsBeforeEnd: null,
        isActive: true,
      });
      const payment = await create({
        type: ReminderRuleType.InstructorPayment,
        sessionsBeforeEnd: 3,
      }).expect(201);
      expect(payment.body).toMatchObject({ type: 'instructor_payment', sessionsBeforeEnd: 3 });

      const [entry] = await audit('reminder_rule.created', (session.body as ReminderRule).id);
      expect(entry).toMatchObject({
        entityType: 'reminder_rules',
        before: null,
        after: {
          type: 'session_reminder',
          leadMinutes: 180,
          sessionsBeforeEnd: null,
          isActive: true,
        },
      });
    });

    it('refuses the same value twice in a type with 409, active or not', async () => {
      const res = await create({ type: ReminderRuleType.SessionReminder, leadMinutes: 180 });
      expect(res.status).toBe(409);
      expect(res.body).toMatchObject({ code: ErrorCode.ReminderRuleExists });

      const [rule] = (await list()).filter((item) => item.leadMinutes === 180);
      await request(app.getHttpServer())
        .patch(api(`/reminder-rules/${rule.id}`))
        .set(as(adminToken))
        .send({ isActive: false })
        .expect(200);
      await create({ type: ReminderRuleType.SessionReminder, leadMinutes: 180 }).expect(409);
    });

    it('allows the same number in two different types', async () => {
      await create({ type: ReminderRuleType.StudentPayment, sessionsBeforeEnd: 4 }).expect(201);
      await create({ type: ReminderRuleType.InstructorPayment, sessionsBeforeEnd: 4 }).expect(201);
    });

    it.each([
      ['a lead under 30 minutes', { type: 'session_reminder', leadMinutes: 29 }],
      ['a lead over 7 days', { type: 'session_reminder', leadMinutes: 10081 }],
      ['a lead that is not a whole number', { type: 'session_reminder', leadMinutes: 90.5 }],
      ['a session rule without a lead', { type: 'session_reminder' }],
      ['0 sessions', { type: 'student_payment', sessionsBeforeEnd: 0 }],
      ['21 sessions', { type: 'instructor_payment', sessionsBeforeEnd: 21 }],
      ['a payment rule without a count', { type: 'student_payment' }],
      ['an unknown type', { type: 'other', leadMinutes: 60 }],
      ['an unknown property', { type: 'session_reminder', leadMinutes: 60, isActive: false }],
    ])('refuses %s with 400', async (_name, body) => {
      const res = await create(body);
      expect(res.status).toBe(400);
      expect(res.body).toMatchObject({ code: ErrorCode.ValidationFailed });
    });

    it('refuses the value of another type with 422', async () => {
      const lead = await create({
        type: ReminderRuleType.SessionReminder,
        leadMinutes: 90,
        sessionsBeforeEnd: 2,
      });
      expect(lead.status).toBe(422);
      expect(lead.body).toMatchObject({ code: ErrorCode.ValidationFailed });
      await create({
        type: ReminderRuleType.StudentPayment,
        sessionsBeforeEnd: 2,
        leadMinutes: 60,
      }).expect(422);
    });

    it('stops at 10 rules of a type with 422, and only for that type', async () => {
      const academy = await createAcademy(prisma, 'reminder-rules-limit');
      try {
        await createUser(prisma, academy, {
          name: 'limit-admin',
          email: mail('limit-admin'),
          password,
          role: SystemRole.Admin,
        });
        const token = await login(mail('limit-admin'));
        // The defaults already hold 2 of each type.
        for (let sessions = 3; sessions <= 10; sessions += 1) {
          await create(
            { type: ReminderRuleType.StudentPayment, sessionsBeforeEnd: sessions },
            token,
          ).expect(201);
        }
        const res = await create(
          { type: ReminderRuleType.StudentPayment, sessionsBeforeEnd: 11 },
          token,
        );
        expect(res.status).toBe(422);
        expect(res.body).toMatchObject({ code: ErrorCode.ReminderRulesLimit });
        await create(
          { type: ReminderRuleType.InstructorPayment, sessionsBeforeEnd: 3 },
          token,
        ).expect(201);
      } finally {
        await removeAcademy(prisma, academy);
      }
    });
  });

  describe('change', () => {
    let ruleId: string;

    beforeAll(async () => {
      const res = await create({ type: ReminderRuleType.SessionReminder, leadMinutes: 300 });
      ruleId = (res.body as ReminderRule).id;
    });

    const patch = (body: object, id = ruleId, token = adminToken) =>
      request(app.getHttpServer())
        .patch(api(`/reminder-rules/${id}`))
        .set(as(token))
        .send(body);

    it('changes the value and turns the rule off and on, with before and after in the audit', async () => {
      const changed = await patch({ leadMinutes: 360, isActive: false }).expect(200);
      expect(changed.body).toEqual({
        id: ruleId,
        type: 'session_reminder',
        leadMinutes: 360,
        sessionsBeforeEnd: null,
        isActive: false,
      });
      await patch({ isActive: true }).expect(200);
      const entries = await audit('reminder_rule.changed', ruleId);
      expect(entries).toHaveLength(2);
      expect(
        entries.find(
          (entry) => (entry.before as { leadMinutes?: number } | null)?.leadMinutes === 300,
        ),
      ).toMatchObject({
        before: { leadMinutes: 300, isActive: true },
        after: { leadMinutes: 360, isActive: false },
      });
    });

    it('writes no audit entry when nothing changes', async () => {
      const before = (await audit('reminder_rule.changed', ruleId)).length;
      await patch({ leadMinutes: 360 }).expect(200);
      await patch({}).expect(200);
      expect(await audit('reminder_rule.changed', ruleId)).toHaveLength(before);
    });

    it('refuses a value already used in the type with 409', async () => {
      const res = await patch({ leadMinutes: 60 });
      expect(res.status).toBe(409);
      expect(res.body).toMatchObject({ code: ErrorCode.ReminderRuleExists });
    });

    it('cannot change the type, and refuses the value of another type', async () => {
      await patch({ type: 'student_payment' }).expect(400);
      const res = await patch({ sessionsBeforeEnd: 3 });
      expect(res.status).toBe(422);
      const payment = (await list()).find((rule) => rule.type === 'student_payment');
      if (!payment) throw new Error('No payment rule');
      await patch({ leadMinutes: 60 }, payment.id).expect(422);
    });

    it('refuses a value out of range with 400', async () => {
      await patch({ leadMinutes: 10 }).expect(400);
      await patch({ isActive: 'yes' }).expect(400);
    });

    it('answers 404 for a rule that does not exist', async () => {
      await patch({ isActive: false }, '7a4d3b1e-0000-4000-8000-000000000000').expect(404);
    });
  });

  describe('remove', () => {
    it('deletes the rule, even the last one of a type, with an audit entry', async () => {
      const rules = await list();
      const students = rules.filter((rule) => rule.type === 'student_payment');
      for (const rule of students) {
        await request(app.getHttpServer())
          .delete(api(`/reminder-rules/${rule.id}`))
          .set(as(adminToken))
          .expect(204);
      }
      expect((await list()).filter((rule) => rule.type === 'student_payment')).toHaveLength(0);
      const [entry] = await audit('reminder_rule.deleted', students[0].id);
      expect(entry).toMatchObject({
        before: { type: 'student_payment' },
        after: null,
      });
    });

    it('answers 404 the second time', async () => {
      const [rule] = await list();
      const del = () =>
        request(app.getHttpServer())
          .delete(api(`/reminder-rules/${rule.id}`))
          .set(as(adminToken));
      await del().expect(204);
      await del().expect(404);
    });
  });

  describe('who can', () => {
    it('refuses an instructor with 403 on every route', async () => {
      const [rule] = await list();
      const server = app.getHttpServer();
      await request(server).get(api('/reminder-rules')).set(as(instructorToken)).expect(403);
      await create({ type: 'session_reminder', leadMinutes: 600 }, instructorToken).expect(403);
      await request(server)
        .patch(api(`/reminder-rules/${rule.id}`))
        .set(as(instructorToken))
        .send({ isActive: false })
        .expect(403);
      await request(server)
        .delete(api(`/reminder-rules/${rule.id}`))
        .set(as(instructorToken))
        .expect(403);
    });

    it('needs a login', async () => {
      await request(app.getHttpServer()).get(api('/reminder-rules')).expect(401);
    });

    it("hides another academy's rules: not in the list, 404 to change or delete", async () => {
      const mine = await list();
      const theirs = await list(otherAdminToken);
      const mineIds = new Set(mine.map((rule) => rule.id));
      expect(theirs.every((rule) => !mineIds.has(rule.id))).toBe(true);
      await request(app.getHttpServer())
        .patch(api(`/reminder-rules/${theirs[0].id}`))
        .set(as(adminToken))
        .send({ isActive: false })
        .expect(404);
      await request(app.getHttpServer())
        .delete(api(`/reminder-rules/${theirs[0].id}`))
        .set(as(adminToken))
        .expect(404);
    });
  });
});
