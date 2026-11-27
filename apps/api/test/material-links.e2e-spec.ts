import { randomUUID } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import type { INestApplication } from '@nestjs/common';
import {
  ErrorCode,
  MATERIAL_LINKS_MAX,
  SystemRole,
  type MaterialLink,
  type Problem,
} from '@kidzzy/shared';
import request from 'supertest';
import type { App } from 'supertest/types';
import { PrismaService } from '../src/modules/prisma/prisma.service';
import { createAcademy, createTestApp, createUser, readCookies, removeAcademy } from './helpers';

// US-32 (SCRUM-36) and US-33 (SCRUM-37): the admin keeps one ordered list of material links and
// every instructor reads it in that order.

interface Setup {
  academyId: string;
  admin: string;
  ana: string;
}

describe('Material links (e2e)', () => {
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

  /** An academy with its admin and one instructor (ana). */
  async function setup(label: string): Promise<Setup> {
    const academyId = await createAcademy(prisma, `materials-${label}`);
    academies.push(academyId);
    const user = (name: string, role: SystemRole) =>
      createUser(prisma, academyId, { name, email: mail(name, label), password, role });
    await user('admin', SystemRole.Admin);
    await user('ana', SystemRole.Instructor);
    return {
      academyId,
      admin: await signIn(mail('admin', label)),
      ana: await signIn(mail('ana', label)),
    };
  }

  const add = (token: string, body: object) =>
    request(server()).post(api('/material-links')).set(as(token)).send(body);

  /** Adds a link per title, in that order, and returns them by title. */
  async function addAll(token: string, ...titles: string[]): Promise<MaterialLink[]> {
    const links: MaterialLink[] = [];
    for (const title of titles) {
      const res = await add(token, { title, url: `https://example.com/${title}` }).expect(201);
      links.push(res.body as MaterialLink);
    }
    return links;
  }

  const change = (token: string, id: string, body: object) =>
    request(server())
      .patch(api(`/material-links/${id}`))
      .set(as(token))
      .send(body);

  const remove = (token: string, id: string) =>
    request(server())
      .delete(api(`/material-links/${id}`))
      .set(as(token));

  const reorder = (token: string, ids: unknown) =>
    request(server()).put(api('/material-links/order')).set(as(token)).send({ ids });

  const list = async (token: string) =>
    (
      (await request(server()).get(api('/material-links')).set(as(token)).expect(200)).body as {
        data: MaterialLink[];
      }
    ).data;

  /** "title position" per link, as the list shows them. */
  const order = async (token: string) =>
    (await list(token)).map((link) => `${link.title} ${link.sortOrder}`);

  /** Inserts rows directly, for the tests about the limit. */
  const seedLinks = (academyId: string, count: number) =>
    prisma.unscoped.materialLink.createMany({
      data: Array.from({ length: count }, (_, index) => ({
        academyId,
        title: `link ${index + 1}`,
        url: 'https://example.com',
        sortOrder: index + 1,
      })),
    });

  const auditOf = (academyId: string) =>
    prisma.unscoped.auditLog.findMany({
      where: { academyId, entityType: 'material_links' },
      orderBy: { createdAt: 'asc' },
    });

  const fieldsOf = (body: unknown) => ((body as Problem).errors ?? []).map((error) => error.field);

  beforeAll(async () => {
    app = await createTestApp({ loginRateLimit: 1000 });
    prisma = app.get(PrismaService);
  });

  afterAll(async () => {
    for (const academyId of academies) await removeAcademy(prisma, academyId);
    await app.close();
  });

  describe('adding, editing and deleting', () => {
    it('adds trimmed links to the end and lists them in order', async () => {
      const s = await setup('add');
      const first = await add(s.admin, {
        title: '  Scratch basics  ',
        url: '  https://drive.google.com/drive/folders/abc?usp=sharing  ',
      }).expect(201);
      expect(first.body).toEqual({
        id: expect.any(String) as string,
        title: 'Scratch basics',
        url: 'https://drive.google.com/drive/folders/abc?usp=sharing',
        sortOrder: 1,
      });
      // The same address may be listed twice.
      await add(s.admin, {
        title: 'Python',
        url: 'https://drive.google.com/drive/folders/abc?usp=sharing',
      }).expect(201);

      expect(await order(s.admin)).toEqual(['Scratch basics 1', 'Python 2']);
    });

    it('edits the title, the address or both, and leaves the place', async () => {
      const s = await setup('edit');
      const [, b] = await addAll(s.admin, 'a', 'b', 'c');

      const renamed = await change(s.admin, b.id, { title: ' B ' }).expect(200);
      expect(renamed.body).toEqual({ ...b, title: 'B' });
      const moved = await change(s.admin, b.id, { url: 'http://example.org/new' }).expect(200);
      expect(moved.body).toEqual({ ...b, title: 'B', url: 'http://example.org/new' });

      expect(await order(s.admin)).toEqual(['a 1', 'B 2', 'c 3']);
    });

    it('writes nothing, and no audit row, for an edit that changes nothing', async () => {
      const s = await setup('same');
      const [a] = await addAll(s.admin, 'a');
      await change(s.admin, a.id, {}).expect(200);
      await change(s.admin, a.id, { title: 'a', url: a.url }).expect(200);
      expect((await auditOf(s.academyId)).map((row) => row.action)).toEqual([
        'material_link.created',
      ]);
    });

    it('deletes for good and closes the gap, keeping the order of the others', async () => {
      const s = await setup('delete');
      const [a, , , d] = await addAll(s.admin, 'a', 'b', 'c', 'd');
      // Put them out of their creation order first, so the order kept is the admin's.
      const ids = (await list(s.admin)).map((link) => link.id);
      await reorder(s.admin, [d.id, ...ids.slice(0, 3)]).expect(200);

      await remove(s.admin, a.id).expect(204);
      expect(await order(s.admin)).toEqual(['d 1', 'b 2', 'c 3']);
      await remove(s.admin, d.id).expect(204);
      expect(await order(s.admin)).toEqual(['b 1', 'c 2']);
      await remove(s.admin, d.id).expect(404);

      // A new link still goes to the end.
      await addAll(s.admin, 'e');
      expect(await order(s.admin)).toEqual(['b 1', 'c 2', 'e 3']);
    });

    it('answers 404 for an unknown id and 400 for one that is not a uuid', async () => {
      const s = await setup('unknown');
      await change(s.admin, randomUUID(), { title: 'x' }).expect(404);
      await remove(s.admin, randomUUID()).expect(404);
      await change(s.admin, 'order', { title: 'x' }).expect(400);
      await remove(s.admin, 'order').expect(400);
    });
  });

  describe('validation', () => {
    const url = 'https://example.com';

    it('refuses a missing, empty or too long title, counted after trimming', async () => {
      const s = await setup('titles');
      for (const title of [undefined, null, '', '   ', 'a'.repeat(101), 5]) {
        const res = await add(s.admin, { title, url }).expect(400);
        expect(fieldsOf(res.body)).toEqual(['title']);
      }
      await add(s.admin, { title: ` ${'a'.repeat(100)} `, url }).expect(201);
    });

    it('takes only an absolute http or https address of at most 2048 characters', async () => {
      const s = await setup('urls');
      const base = 'https://example.com/';
      const refused = [
        undefined,
        null,
        '',
        'javascript:alert(1)',
        'data:text/html,hi',
        'ftp://example.com',
        'example.com/course',
        '/course',
        '//example.com',
        base + 'a'.repeat(2049 - base.length),
      ];
      for (const bad of refused) {
        const res = await add(s.admin, { title: 'x', url: bad }).expect(400);
        expect(res.body).toMatchObject({ code: ErrorCode.ValidationFailed });
        expect(fieldsOf(res.body)).toEqual(['url']);
      }
      await add(s.admin, { title: 'x', url: base + 'a'.repeat(2048 - base.length) }).expect(201);
      await add(s.admin, { title: 'y', url: 'http://example.com' }).expect(201);
    });

    it('applies the same rules on an edit, null included, and refuses unknown properties', async () => {
      const s = await setup('patch');
      const [a] = await addAll(s.admin, 'a');
      for (const body of [
        { title: null },
        { title: '  ' },
        { url: null },
        { url: 'javascript:alert(1)' },
        { sortOrder: 5 },
      ]) {
        await change(s.admin, a.id, body).expect(400);
      }
      await add(s.admin, { title: 'x', url, sortOrder: 1 }).expect(400);
      expect(await list(s.admin)).toEqual([a]);
    });
  });

  describe('the limit', () => {
    it(`accepts the ${MATERIAL_LINKS_MAX}th link and refuses the next with 422`, async () => {
      const s = await setup('limit');
      await seedLinks(s.academyId, MATERIAL_LINKS_MAX - 1);
      const last = await add(s.admin, { title: 'last', url: 'https://example.com' }).expect(201);
      expect(last.body).toMatchObject({ sortOrder: MATERIAL_LINKS_MAX });

      const res = await add(s.admin, { title: 'extra', url: 'https://example.com' }).expect(422);
      expect(res.body).toMatchObject({ code: ErrorCode.MaterialLinksLimit });
      expect(await list(s.admin)).toHaveLength(MATERIAL_LINKS_MAX);
    });

    it('holds when two links are added at the same moment', async () => {
      const s = await setup('limit-race');
      await seedLinks(s.academyId, MATERIAL_LINKS_MAX - 1);
      const body = { title: 'one more', url: 'https://example.com' };
      const results = await Promise.all([add(s.admin, body), add(s.admin, body)]);
      expect(results.map((res) => res.status).sort()).toEqual([201, 422]);
      expect(await list(s.admin)).toHaveLength(MATERIAL_LINKS_MAX);
    });

    it('gives links added at the same moment different places', async () => {
      const s = await setup('race');
      const body = { title: 'same time', url: 'https://example.com' };
      await Promise.all([add(s.admin, body).expect(201), add(s.admin, body).expect(201)]);
      expect((await list(s.admin)).map((link) => link.sortOrder)).toEqual([1, 2]);
    });
  });

  describe('reordering', () => {
    it('saves a new order of every link and returns the list in it', async () => {
      const s = await setup('order');
      const [a, b, c, d] = await addAll(s.admin, 'a', 'b', 'c', 'd');

      // A full reversal: every link takes a place another one holds.
      const res = await reorder(s.admin, [d.id, c.id, b.id, a.id]).expect(200);
      expect((res.body as { data: MaterialLink[] }).data).toEqual([
        { ...d, sortOrder: 1 },
        { ...c, sortOrder: 2 },
        { ...b, sortOrder: 3 },
        { ...a, sortOrder: 4 },
      ]);
      expect(await order(s.ana)).toEqual(['d 1', 'c 2', 'b 3', 'a 4']);

      // A swap of two neighbours, with an id in capital letters.
      await reorder(s.admin, [d.id, b.id.toUpperCase(), c.id, a.id]).expect(200);
      expect(await order(s.admin)).toEqual(['d 1', 'b 2', 'c 3', 'a 4']);
    });

    it('refuses a list that is not every link exactly once with 422 and changes nothing', async () => {
      const s = await setup('wrong-set');
      const other = await setup('wrong-set-other');
      const [a, b, c] = await addAll(s.admin, 'a', 'b', 'c');
      const [foreign] = await addAll(other.admin, 'foreign');

      const wrong = [
        [c.id, b.id],
        [c.id, b.id, a.id, randomUUID()],
        [c.id, b.id, b.id],
        [c.id, b.id, a.id, a.id],
        [c.id, b.id, foreign.id],
        [c.id, b.id, a.id, foreign.id],
      ];
      for (const ids of wrong) {
        const res = await reorder(s.admin, ids).expect(422);
        expect(res.body).toMatchObject({ code: ErrorCode.ValidationFailed });
        expect(fieldsOf(res.body)).toEqual(['ids']);
      }
      expect(await order(s.admin)).toEqual(['a 1', 'b 2', 'c 3']);
      expect(await order(other.admin)).toEqual(['foreign 1']);
    });

    it('refuses a body that is not a list of ids with 400', async () => {
      const s = await setup('order-shape');
      for (const ids of [undefined, [], 'abc', ['abc'], [1]]) {
        await reorder(s.admin, ids).expect(400);
      }
    });
  });

  describe('access', () => {
    it('lets an instructor read the list and refuses every write with 403', async () => {
      const s = await setup('instructor');
      const [a, b] = await addAll(s.admin, 'a', 'b');

      expect(await list(s.ana)).toEqual([a, b]);
      await add(s.ana, { title: 'x', url: 'https://example.com' }).expect(403);
      await change(s.ana, a.id, { title: 'x' }).expect(403);
      await remove(s.ana, a.id).expect(403);
      await reorder(s.ana, [b.id, a.id]).expect(403);

      expect(await list(s.admin)).toEqual([a, b]);
    });

    it('answers 401 without a login', async () => {
      const id = randomUUID();
      await request(server()).get(api('/material-links')).expect(401);
      await request(server()).post(api('/material-links')).send({}).expect(401);
      await request(server())
        .put(api('/material-links/order'))
        .send({ ids: [id] })
        .expect(401);
      await request(server())
        .patch(api(`/material-links/${id}`))
        .send({})
        .expect(401);
      await request(server())
        .delete(api(`/material-links/${id}`))
        .expect(401);
    });

    it("never lists another academy's links, and answers 404 for changing them", async () => {
      const s = await setup('tenant');
      const other = await setup('tenant-other');
      await addAll(s.admin, 'mine');
      const [theirs] = await addAll(other.admin, 'theirs');

      expect(await order(s.admin)).toEqual(['mine 1']);
      expect(await order(s.ana)).toEqual(['mine 1']);
      await change(s.admin, theirs.id, { title: 'taken' }).expect(404);
      await remove(s.admin, theirs.id).expect(404);
      expect(await list(other.admin)).toEqual([theirs]);
    });
  });

  describe('audit', () => {
    it('records who added, changed, reordered and deleted what', async () => {
      const s = await setup('audit');
      const [a, b] = await addAll(s.admin, 'a', 'b');
      await change(s.admin, a.id, { title: 'A' }).expect(200);
      await reorder(s.admin, [b.id, a.id]).expect(200);
      // The same order again changes nothing, so it is not recorded.
      await reorder(s.admin, [b.id, a.id]).expect(200);
      await remove(s.admin, b.id).expect(204);

      const rows = await auditOf(s.academyId);
      expect(
        rows.map(({ action, entityId, before, after }) => ({ action, entityId, before, after })),
      ).toEqual([
        {
          action: 'material_link.created',
          entityId: a.id,
          before: null,
          after: { title: 'a', url: a.url },
        },
        {
          action: 'material_link.created',
          entityId: b.id,
          before: null,
          after: { title: 'b', url: b.url },
        },
        {
          action: 'material_link.changed',
          entityId: a.id,
          before: { title: 'a', url: a.url },
          after: { title: 'A', url: a.url },
        },
        {
          action: 'material_link.reordered',
          entityId: s.academyId,
          before: null,
          after: { ids: [b.id, a.id] },
        },
        {
          action: 'material_link.deleted',
          entityId: b.id,
          before: { title: 'b', url: b.url },
          after: null,
        },
      ]);
    });
  });

  describe('the migration', () => {
    const permissionSql = () => {
      const dir = join(__dirname, '..', 'prisma', 'migrations');
      const folder = readdirSync(dir).find((name) => name.endsWith('_material_links'));
      if (!folder) throw new Error('migration not found');
      const sql = readFileSync(join(dir, folder, 'migration.sql'), 'utf8');
      return sql.slice(sql.indexOf('-- The permissions of the material links'));
    };

    it('grants read to Admin and Instructor and manage to Admin; twice changes nothing', async () => {
      const s = await setup('migration');
      const where = {
        role: { academyId: s.academyId },
        permission: { key: { startsWith: 'materials.' } },
      };
      await prisma.unscoped.rolePermission.deleteMany({ where });

      const statements = permissionSql()
        .split('\n')
        .filter((line) => !line.trim().startsWith('--'))
        .join('\n')
        .split(';')
        .map((statement) => statement.trim())
        .filter(Boolean);
      expect(statements).toHaveLength(3);
      for (let run = 0; run < 2; run += 1) {
        for (const statement of statements) await prisma.unscoped.$executeRawUnsafe(statement);
      }

      const granted = await prisma.unscoped.rolePermission.findMany({
        where,
        select: { role: { select: { name: true } }, permission: { select: { key: true } } },
      });
      expect(granted.map((row) => `${row.role.name} ${row.permission.key}`).sort()).toEqual([
        'Admin materials.manage:any',
        'Admin materials.read:any',
        'Instructor materials.read:any',
      ]);
    });
  });
});
