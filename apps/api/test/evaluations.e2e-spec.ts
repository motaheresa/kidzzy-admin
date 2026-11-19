import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import type { INestApplication } from '@nestjs/common';
import {
  SystemRole,
  type AcademySettings,
  type EvaluationRequest,
  type Me,
  type StudentEvaluation,
} from '@kidzzy/shared';
import request from 'supertest';
import type { App } from 'supertest/types';
import { PrismaService } from '../src/modules/prisma/prisma.service';
import {
  createAcademy,
  createTestApp,
  createUser,
  postHeld,
  readCookies,
  removeAcademy,
} from './helpers';

// US-42 (SCRUM-87): an evaluation required when a student cycle becomes Due. "Now" is
// 2026-11-12 10:00 in Cairo, so every session below is in the past and can be marked Held.
const NOW = new Date('2026-11-12T08:00:00.000Z');
const at = (day: string) => `${day}T15:00:00.000Z`;

interface Login {
  access: string;
  refresh: string;
}

interface Setup {
  academyId: string;
  admin: Login;
  ana: Login;
  omar: Login;
  anaId: string;
  omarId: string;
  label: string;
}

describe('Required evaluations (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  const academies: string[] = [];
  const password = 'correct-horse-1';
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  const mail = (name: string, label: string) => `${name}-${label}-${stamp}@test.local`;
  let count = 0;

  const server = () => app.getHttpServer();
  const api = (path: string) => `/api/v1${path}`;
  const as = (login: Login | string) => ({
    Cookie: `access_token=${typeof login === 'string' ? login : login.access}`,
  });

  async function signIn(email: string): Promise<Login> {
    const res = await request(server())
      .post(api('/auth/login'))
      .send({ login: email, password })
      .expect(200);
    const cookies = readCookies(res.headers['set-cookie']);
    return { access: cookies.access_token.value, refresh: cookies.refresh_token.value };
  }

  /** POST /auth/refresh: a new access token, with the claims as they are now. */
  async function refresh(login: Login): Promise<Login> {
    const res = await request(server())
      .post(api('/auth/refresh'))
      .set({ Cookie: `refresh_token=${login.refresh}` })
      .expect(204);
    const cookies = readCookies(res.headers['set-cookie']);
    return { access: cookies.access_token.value, refresh: cookies.refresh_token.value };
  }

  async function setup(label: string): Promise<Setup> {
    const academyId = await createAcademy(prisma, `evaluations-${label}`);
    academies.push(academyId);
    await createUser(prisma, academyId, {
      name: 'admin',
      email: mail('admin', label),
      password,
      role: SystemRole.Admin,
    });
    const anaId = await createUser(prisma, academyId, {
      name: 'ana',
      email: mail('ana', label),
      password,
      role: SystemRole.Instructor,
    });
    const omarId = await createUser(prisma, academyId, {
      name: 'omar',
      email: mail('omar', label),
      password,
      role: SystemRole.Instructor,
    });
    return {
      academyId,
      admin: await signIn(mail('admin', label)),
      ana: await signIn(mail('ana', label)),
      omar: await signIn(mail('omar', label)),
      anaId,
      omarId,
      label,
    };
  }

  function group(s: Setup, name: string, instructorId = s.anaId) {
    return prisma.unscoped.group.create({
      data: {
        academyId: s.academyId,
        name,
        searchText: name,
        level: 'Scratch 1',
        instructorId,
        startDate: new Date('2026-10-01T00:00:00.000Z'),
      },
    });
  }

  function session(s: Setup, groupId: string, when: string, instructorId = s.anaId) {
    return prisma.unscoped.session.create({
      data: {
        academyId: s.academyId,
        groupId,
        instructorId,
        scheduledAt: new Date(when),
        durationMin: 60,
        status: 'scheduled',
      },
    });
  }

  async function newStudent(s: Setup, name: string) {
    count += 1;
    return prisma.unscoped.student.create({
      data: {
        academyId: s.academyId,
        code: `E-${count}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`,
        name,
        nameSearch: name,
        parentName: 'Parent',
        parentPhone: '+201000000000',
      },
    });
  }

  /** A student enrolled through the API with a plan of `sessionsPerCycle`, so a Held counts. */
  async function enrolled(s: Setup, groupId: string, name: string, sessionsPerCycle = 1) {
    const student = await newStudent(s, name);
    await request(server())
      .post(api(`/groups/${groupId}/enrollments`))
      .set(as(s.admin))
      .send({
        studentId: student.id,
        startDate: '2026-10-01',
        plan: { sessionsPerCycle, amount: '900.00' },
      })
      .expect(201);
    return student;
  }

  const settings = (s: Setup, evaluationsRequired: boolean) =>
    request(server())
      .patch(api('/academy/settings'))
      .set(as(s.admin))
      .send({ evaluationsRequired })
      .expect(200);

  const hold = (s: Setup, sessionId: string) =>
    postHeld(server(), prisma, sessionId, s.admin.access).expect(200);

  const pendingOf = (s: Setup) =>
    prisma.unscoped.studentEvaluation.findMany({
      where: { academyId: s.academyId, status: 'pending' },
      orderBy: { requestedAt: 'asc' },
    });

  const submit = (login: Login | string, id: string, body: object) =>
    request(server())
      .post(api(`/evaluation-requests/${id}/submit`))
      .set(as(login))
      .send(body);

  const goodEvaluation = {
    overallRating: 4,
    summary: 'Worked steadily this month and finished both projects.',
    strengths: 'Loops',
    toImprove: 'Naming',
  };

  /** A cycle_due request for ana: the rule on, one student with a one-session cycle, one Held. */
  async function withCycleDueRequest(label: string) {
    const s = await setup(label);
    await settings(s, true);
    const g = await group(s, 'G');
    const student = await enrolled(s, g.id, 'Aya');
    const first = await session(s, g.id, at('2026-11-02'));
    await hold(s, first.id);
    const [pending] = await pendingOf(s);
    return { s, g, student, first, pending };
  }

  beforeAll(async () => {
    app = await createTestApp({ loginRateLimit: 1000, now: NOW });
    prisma = app.get(PrismaService);
  });

  afterAll(async () => {
    for (const id of academies) await removeAcademy(prisma, id);
    await app.close();
  });

  describe('requests from a Held session', () => {
    it('asks the instructor on the session, not the group current one, when the rule is on', async () => {
      const s = await setup('held-on');
      await settings(s, true);
      // Omar teaches the group now; Ana held this session, so the request goes to Ana.
      const g = await group(s, 'G', s.omarId);
      const student = await enrolled(s, g.id, 'Aya');
      const held = await session(s, g.id, at('2026-11-02'), s.anaId);
      await hold(s, held.id);

      const pending = await pendingOf(s);
      expect(pending).toHaveLength(1);
      expect(pending[0]).toMatchObject({
        studentId: student.id,
        instructorId: s.anaId,
        groupId: g.id,
        source: 'cycle_due',
        status: 'pending',
        requestedById: null,
      });
      expect(pending[0]?.cycleId).not.toBeNull();

      const notes = await prisma.unscoped.notification.findMany({
        where: { academyId: s.academyId, type: 'evaluation_request' },
      });
      expect(notes).toHaveLength(1);
      expect(notes[0]).toMatchObject({
        userId: s.anaId,
        title: 'مطلوب تقييم للطالب Aya',
        body: 'جروب G',
      });
      expect(notes[0]?.data).toMatchObject({ url: '/evaluation', requestId: pending[0]?.id });
    });

    it('asks nothing when the rule is off', async () => {
      const s = await setup('held-off');
      const g = await group(s, 'G');
      await enrolled(s, g.id, 'Aya');
      await hold(s, (await session(s, g.id, at('2026-11-02'))).id);
      expect(await pendingOf(s)).toHaveLength(0);
    });

    it('does not ask for an instructor cycle, and makes no second request while one is pending', async () => {
      const s = await setup('held-once');
      await settings(s, true);
      const g = await group(s, 'G');
      await request(server())
        .post(api(`/instructors/${s.anaId}/payment-plans`))
        .set(as(s.admin))
        .send({ groupId: g.id, sessionsPerCycle: 1, amount: '1500.00' })
        .expect(201);
      await enrolled(s, g.id, 'Aya');
      await hold(s, (await session(s, g.id, at('2026-11-02'))).id);
      await hold(s, (await session(s, g.id, at('2026-11-03'))).id); // a second cycle becomes Due

      const all = await prisma.unscoped.studentEvaluation.findMany({
        where: { academyId: s.academyId },
      });
      expect(all).toHaveLength(1); // one for the student, none for Ana's own cycles
      expect(all[0]?.status).toBe('pending');
    });

    it('cancels a pending request when the Held is undone, and keeps a submitted one', async () => {
      const { s, first, pending } = await withCycleDueRequest('undo');
      await request(server())
        .post(api(`/sessions/${first.id}/undo-held`))
        .set(as(s.admin))
        .expect(200);
      const cancelled = await prisma.unscoped.studentEvaluation.findUniqueOrThrow({
        where: { id: pending.id },
      });
      expect(cancelled.status).toBe('cancelled');
      expect(cancelled.cancelledAt).not.toBeNull();

      // Held again: a new request, written this time; an undo then leaves it as it is.
      await hold(s, first.id);
      const [again] = await pendingOf(s);
      await submit(s.ana, again.id, goodEvaluation).expect(200);
      await request(server())
        .post(api(`/sessions/${first.id}/undo-held`))
        .set(as(s.admin))
        .expect(200);
      const kept = await prisma.unscoped.studentEvaluation.findUniqueOrThrow({
        where: { id: again.id },
      });
      expect(kept.status).toBe('submitted');
    });
  });

  describe('the gate', () => {
    it('blocks every other route after a refresh, and lets the evaluation routes through', async () => {
      const { s } = await withCycleDueRequest('gate');
      // The token Ana had before the request still passes: the guard reads only the token.
      await request(server()).get(api('/groups')).set(as(s.ana)).expect(200);

      const gated = await refresh(s.ana);
      const refused = await request(server()).get(api('/groups')).set(as(gated)).expect(403);
      expect((refused.body as { code: string }).code).toBe('EVALUATION_REQUIRED');
      const me = (await request(server()).get(api('/auth/me')).set(as(gated)).expect(200))
        .body as Me;
      expect(me.pendingEvaluations).toBe(1);
      const mine = (
        await request(server()).get(api('/me/evaluation-requests')).set(as(gated)).expect(200)
      ).body as EvaluationRequest[];
      expect(mine).toHaveLength(1);
      expect(mine[0]).toMatchObject({ source: 'cycle_due', cycleNumber: 1 });
      expect(mine[0]?.student.name).toBe('Aya');
      // change-password is allowed: a wrong current password is its own error, not the gate.
      const change = await request(server())
        .post(api('/auth/change-password'))
        .set(as(gated))
        .send({ currentPassword: 'wrong-password-1', newPassword: 'another-horse-2' });
      expect((change.body as { code?: string }).code).not.toBe('EVALUATION_REQUIRED');

      // A fresh login carries the flag too.
      const login = await signIn(mail('ana', s.label));
      await request(server()).get(api('/students')).set(as(login)).expect(403);
    });

    it('lets the password gate win over it', async () => {
      const { s } = await withCycleDueRequest('both-gates');
      await prisma.unscoped.user.update({
        where: { id: s.anaId },
        data: { mustChangePassword: true },
      });
      const login = await signIn(mail('ana', s.label));
      for (const path of ['/groups', '/me/evaluation-requests']) {
        const res = await request(server()).get(api(path)).set(as(login)).expect(403);
        expect((res.body as { code: string }).code).toBe('PASSWORD_CHANGE_REQUIRED');
      }
    });

    it('stops blocking with cycle_due requests when the rule is turned off', async () => {
      const { s } = await withCycleDueRequest('rule-off');
      await settings(s, false);
      const login = await refresh(s.ana);
      await request(server()).get(api('/groups')).set(as(login)).expect(200);
      const me = (await request(server()).get(api('/auth/me')).set(as(login)).expect(200))
        .body as Me;
      expect(me.pendingEvaluations).toBe(0);
    });
  });

  describe('submitting', () => {
    it('is only for the instructor it is addressed to, once, with a valid body; then the app opens', async () => {
      const { s, student, pending } = await withCycleDueRequest('submit');
      const ana = await refresh(s.ana);

      const other = await submit(s.omar, pending.id, goodEvaluation).expect(403);
      expect((other.body as { code: string }).code).toBe('FORBIDDEN');
      await submit(ana, pending.id, { ...goodEvaluation, summary: 'too short' }).expect(400);
      await submit(ana, pending.id, { ...goodEvaluation, overallRating: 6 }).expect(400);
      await submit(ana, pending.id, { summary: goodEvaluation.summary }).expect(400);

      const written = (await submit(ana, pending.id, goodEvaluation).expect(200))
        .body as StudentEvaluation;
      expect(written).toMatchObject({
        overallRating: 4,
        summary: goodEvaluation.summary,
        strengths: 'Loops',
        toImprove: 'Naming',
        cycleNumber: 1,
      });
      const twice = await submit(ana, pending.id, goodEvaluation).expect(409);
      expect((twice.body as { code: string }).code).toBe('EVALUATION_NOT_PENDING');

      const open = await refresh(ana);
      await request(server()).get(api('/groups')).set(as(open)).expect(200);

      const forStudent = (
        await request(server())
          .get(api(`/students/${student.id}/evaluations`))
          .set(as(s.admin))
          .expect(200)
      ).body as StudentEvaluation[];
      expect(forStudent.map((e) => e.id)).toEqual([pending.id]);
      const mine = (await request(server()).get(api('/me/evaluations')).set(as(open)).expect(200))
        .body as StudentEvaluation[];
      expect(mine.map((e) => e.id)).toEqual([pending.id]);
    });

    it('turns a blank optional text into null', async () => {
      const { s, pending } = await withCycleDueRequest('blank');
      const written = (
        await submit(s.ana, pending.id, {
          ...goodEvaluation,
          strengths: '   ',
          toImprove: '',
        }).expect(200)
      ).body as StudentEvaluation;
      expect(written).toMatchObject({ strengths: null, toImprove: null });
    });
  });

  describe('the admin', () => {
    it('asks the instructor of the open enrollment, whatever the setting, once at a time', async () => {
      const s = await setup('admin-request');
      const g = await group(s, 'G', s.omarId);
      const student = await enrolled(s, g.id, 'Aya');

      const created = (
        await request(server())
          .post(api(`/students/${student.id}/evaluation-requests`))
          .set(as(s.admin))
          .expect(201)
      ).body as EvaluationRequest;
      expect(created).toMatchObject({ source: 'admin', status: 'pending', cycleNumber: null });
      expect(created.instructor.id).toBe(s.omarId);
      const row = await prisma.unscoped.studentEvaluation.findUniqueOrThrow({
        where: { id: created.id },
      });
      expect(row.requestedById).not.toBeNull();

      const again = await request(server())
        .post(api(`/students/${student.id}/evaluation-requests`))
        .set(as(s.admin))
        .expect(409);
      expect((again.body as { code: string }).code).toBe('EVALUATION_PENDING');

      // An admin request blocks even with the rule off.
      const omar = await refresh(s.omar);
      const refused = await request(server()).get(api('/groups')).set(as(omar)).expect(403);
      expect((refused.body as { code: string }).code).toBe('EVALUATION_REQUIRED');

      const list = (
        await request(server())
          .get(api('/evaluation-requests'))
          .query({ status: 'pending' })
          .set(as(s.admin))
          .expect(200)
      ).body as EvaluationRequest[];
      expect(list.map((r) => r.id)).toEqual([created.id]);

      const cancelled = (
        await request(server())
          .post(api(`/evaluation-requests/${created.id}/cancel`))
          .set(as(s.admin))
          .expect(200)
      ).body as EvaluationRequest;
      expect(cancelled.status).toBe('cancelled');
      const twice = await request(server())
        .post(api(`/evaluation-requests/${created.id}/cancel`))
        .set(as(s.admin))
        .expect(409);
      expect((twice.body as { code: string }).code).toBe('EVALUATION_NOT_PENDING');
      const reopened = await refresh(omar);
      await request(server()).get(api('/groups')).set(as(reopened)).expect(200);
    });

    it('refuses a student with no open enrollment (422)', async () => {
      const s = await setup('no-enrollment');
      const student = await newStudent(s, 'Lone');
      const res = await request(server())
        .post(api(`/students/${student.id}/evaluation-requests`))
        .set(as(s.admin))
        .expect(422);
      expect((res.body as { code: string }).code).toBe('NO_ACTIVE_ENROLLMENT');
    });

    it('keeps the instructor out of the admin routes, and the admin out of the instructor ones', async () => {
      const { s, student, pending } = await withCycleDueRequest('roles');
      await request(server())
        .post(api(`/students/${student.id}/evaluation-requests`))
        .set(as(s.omar))
        .expect(403);
      await request(server()).get(api('/academy/settings')).set(as(s.omar)).expect(403);
      await submit(s.admin, pending.id, goodEvaluation).expect(403);
    });

    it('reads and audits the setting', async () => {
      const s = await setup('settings');
      const before = (
        await request(server()).get(api('/academy/settings')).set(as(s.admin)).expect(200)
      ).body as AcademySettings;
      expect(before).toEqual({ evaluationsRequired: false });
      await settings(s, true);
      const after = (
        await request(server()).get(api('/academy/settings')).set(as(s.admin)).expect(200)
      ).body as AcademySettings;
      expect(after).toEqual({ evaluationsRequired: true });
      const rows = await prisma.unscoped.auditLog.findMany({
        where: { academyId: s.academyId, action: 'academy.settings_updated' },
      });
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({
        before: { evaluationsRequired: false },
        after: { evaluationsRequired: true },
      });
    });
  });

  describe('privacy and tenancy', () => {
    it('never copies the evaluation text into a notification or an audit row', async () => {
      const { s, pending } = await withCycleDueRequest('privacy');
      const secret = 'SECRET-EVALUATION-TEXT-ABOUT-A-CHILD';
      await submit(s.ana, pending.id, {
        overallRating: 5,
        summary: `${secret} in the summary, long enough.`,
        strengths: `${secret} strengths`,
        toImprove: `${secret} to improve`,
      }).expect(200);

      const notifications = await prisma.unscoped.notification.findMany({
        where: { academyId: s.academyId },
      });
      const audit = await prisma.unscoped.auditLog.findMany({ where: { academyId: s.academyId } });
      expect(JSON.stringify(notifications)).not.toContain(secret);
      expect(JSON.stringify(audit)).not.toContain(secret);
      const actions = audit.map((row) => row.action);
      expect(actions).toEqual(
        expect.arrayContaining(['evaluation_request.created', 'evaluation_request.submitted']),
      );
      // The audit rows carry ids and status, never the rating either.
      const submitted = audit.find((row) => row.action === 'evaluation_request.submitted');
      expect(JSON.stringify(submitted)).not.toContain('overallRating');
    });

    it("never reaches another academy's request (404)", async () => {
      const mine = await setup('tenant-mine');
      const { pending: theirs } = await withCycleDueRequest('tenant-theirs');
      await request(server())
        .post(api(`/evaluation-requests/${theirs.id}/cancel`))
        .set(as(mine.admin))
        .expect(404);
      await submit(mine.ana, theirs.id, goodEvaluation).expect(404);
      const list = (
        await request(server()).get(api('/evaluation-requests')).set(as(mine.admin)).expect(200)
      ).body as EvaluationRequest[];
      expect(list).toEqual([]);
    });
  });

  describe('the migration', () => {
    const permissionSql = () => {
      const dir = join(__dirname, '..', 'prisma', 'migrations');
      const folder = readdirSync(dir).find((name) => name.endsWith('_required_evaluations'));
      if (!folder) throw new Error('migration not found');
      const sql = readFileSync(join(dir, folder, 'migration.sql'), 'utf8');
      const start = sql.indexOf('-- The evaluation permissions');
      return sql.slice(start);
    };
    const keysOf = async (academyId: string, role: string) => {
      const rows = await prisma.unscoped.rolePermission.findMany({
        where: { role: { academyId, name: role, isSystem: true } },
        select: { permission: { select: { key: true } } },
      });
      return rows.map((row) => row.permission.key).filter((key) => key.startsWith('evaluations.'));
    };

    it('grants the keys to the system roles of an existing academy, and only there; twice changes nothing', async () => {
      const s = await setup('migration');
      await prisma.unscoped.rolePermission.deleteMany({
        where: {
          role: { academyId: s.academyId },
          permission: { key: { startsWith: 'evaluations.' } },
        },
      });
      expect(await keysOf(s.academyId, 'Admin')).toEqual([]);

      const statements = permissionSql();
      for (let run = 0; run < 2; run += 1) {
        for (const statement of statements.split(';').map((part) => part.trim())) {
          const body = statement
            .split('\n')
            .filter((line) => !line.trim().startsWith('--'))
            .join('\n')
            .trim();
          if (body) await prisma.unscoped.$executeRawUnsafe(body);
        }
      }
      expect((await keysOf(s.academyId, 'Admin')).sort()).toEqual([
        'evaluations.manage:any',
        'evaluations.read:any',
      ]);
      expect(await keysOf(s.academyId, 'Instructor')).toEqual(['evaluations.write:own']);
    });
  });
});
