import type { INestApplication } from '@nestjs/common';
import { SystemRole, type Instructor, type Page, type Student } from '@kidzzy/shared';
import request from 'supertest';
import type { App } from 'supertest/types';
import { normalizeSearchText } from '../src/common/normalize/search-text';
import { PrismaService } from '../src/modules/prisma/prisma.service';
import { createAcademy, createTestApp, createUser, readCookies, removeAcademy } from './helpers';

// US-06 (SCRUM-19): student search. AC: partial names match; an exact code match is listed
// first. Instructor search uses the same normalization.

const NAMES = [
  'أحمد',
  'إيمان',
  'آمال',
  'ٱلنور',
  'فاطمة',
  'مصطفى',
  'مَرْيَمُ',
  'عليّ',
  'رحمٰن',
  'أحمــــد',
  'Mona ADEL',
  '  سارة   محمود ',
  'طالب ١٢ ۳',
  '100% a_b',
];

describe('Search (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let academyId: string;
  let otherAcademyId: string;
  let adminToken: string;
  const password = 'correct-horse-1';
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  const mail = (name: string) => `${name}-${stamp}@test.local`;

  const server = () => app.getHttpServer();
  const api = (path: string) => `/api/v1${path}`;
  const as = (token: string) => ({ Cookie: `access_token=${token}` });

  async function signIn(email: string) {
    const res = await request(server())
      .post(api('/auth/login'))
      .send({ login: email, password })
      .expect(200);
    return readCookies(res.headers['set-cookie']).access_token.value;
  }

  function createStudent(code: string, name: string, token = adminToken) {
    return request(server())
      .post(api('/students'))
      .set(as(token))
      .send({ code, name, parentName: 'ولي امر', parentPhone: '01012345678' })
      .expect(201);
  }

  async function search(path: '/students' | '/instructors', text: string) {
    const res = await request(server())
      .get(api(path))
      .query({ search: text, pageSize: 100 })
      .set(as(adminToken))
      .expect(200);
    return res.body as Page<Student | Instructor>;
  }
  const studentNames = async (text: string) =>
    (await search('/students', text)).data.map((s) => s.name);

  beforeAll(async () => {
    app = await createTestApp({ loginRateLimit: 1000 });
    prisma = app.get(PrismaService);
    academyId = await createAcademy(prisma, 'search');
    otherAcademyId = await createAcademy(prisma, 'search-other');
    await createUser(prisma, academyId, {
      name: 'Admin',
      email: mail('admin'),
      password,
      role: SystemRole.Admin,
    });
    await createUser(prisma, otherAcademyId, {
      name: 'Other admin',
      email: mail('other'),
      password,
      role: SystemRole.Admin,
    });
    adminToken = await signIn(mail('admin'));

    await createStudent('KC-010', 'أحمد علي');
    await createStudent('KC-011', 'مَرْيَم حسن');
    await createStudent('KC-012', 'فاطمة محمود');
    await createStudent('KC-100', 'يوسف');
    // Sorts before يوسف by name, so "exact code first" is a real test.
    await createStudent('KC-1', 'باسم');
    await createStudent('KC-200', '100% sure');
    await createStudent('KC-201', 'under_score');
    // The same name in another academy must never appear.
    await createStudent('KC-010', 'أحمد علي', await signIn(mail('other')));
  });

  afterAll(async () => {
    await removeAcademy(prisma, academyId);
    await removeAcademy(prisma, otherAcademyId);
    await app.close();
  });

  it('the SQL function of the migration agrees with normalizeSearchText', async () => {
    for (const name of NAMES) {
      const [row] = await prisma.unscoped.$queryRaw<{ value: string }[]>`
        SELECT kidzzy_normalize_search(${name}) AS value`;
      expect({ name, value: row.value }).toEqual({ name, value: normalizeSearchText(name) });
    }
  });

  it('stores name_search with every name written', async () => {
    const rows = await prisma.unscoped.student.findMany({
      where: { academyId },
      select: { name: true, nameSearch: true },
    });
    for (const row of rows) expect(row.nameSearch).toBe(normalizeSearchText(row.name));
  });

  it('AC: partial names match, whatever the letter forms, diacritics and case', async () => {
    expect(await studentNames('احمد')).toEqual(['أحمد علي']);
    expect(await studentNames('أحمد')).toEqual(['أحمد علي']);
    expect(await studentNames('مريم')).toEqual(['مَرْيَم حسن']);
    expect(await studentNames('فاطمه')).toEqual(['فاطمة محمود']);
    expect(await studentNames('  محمود ')).toEqual(['فاطمة محمود']);
    expect(await studentNames('SURE')).toEqual(['100% sure']);
  });

  it('matches part of the code, in any case and with Arabic-Indic digits', async () => {
    expect((await studentNames('kc-01')).sort()).toEqual(
      ['أحمد علي', 'مَرْيَم حسن', 'فاطمة محمود'].sort(),
    );
    expect(await studentNames('kc-٠١٢')).toEqual(['فاطمة محمود']);
  });

  it('AC: lists an exact code match first, even when its name sorts later', async () => {
    // "KC-1" is in KC-1, KC-10…, KC-100: the exact one comes first.
    const exact = await search('/students', 'kc-1');
    expect((exact.data[0] as Student).code).toBe('KC-1');
    const hundred = await search('/students', 'KC-100');
    expect((hundred.data[0] as Student).code).toBe('KC-100');
    expect(hundred.meta.total).toBe(1);
  });

  it('treats % and _ as plain characters', async () => {
    expect(await studentNames('%')).toEqual(['100% sure']);
    expect(await studentNames('_')).toEqual(['under_score']);
  });

  it('paginates search results with the total of all matches', async () => {
    const res = await request(server())
      .get(api('/students'))
      .query({ search: 'kc', page: 2, pageSize: 2 })
      .set(as(adminToken))
      .expect(200);
    const body = res.body as Page<Student>;
    expect(body.meta).toEqual({ page: 2, pageSize: 2, total: 7 });
    expect(body.data).toHaveLength(2);
  });

  it('ignores a search that is empty after normalization', async () => {
    const all = await search('/students', 'ـ');
    expect(all.meta.total).toBe(7);
  });

  it('finds an instructor by an Arabic variant of the name', async () => {
    await createUser(prisma, academyId, {
      name: 'أَسماء إبراهيم',
      email: mail('asmaa'),
      password,
      role: SystemRole.Instructor,
    });
    const found = await search('/instructors', 'اسماء ابراهيم');
    expect(found.data.map((i) => i.name)).toEqual(['أَسماء إبراهيم']);
  });

  it('refuses a search longer than 100 characters (400)', async () => {
    await request(server())
      .get(api('/students'))
      .query({ search: 'ا'.repeat(101) })
      .set(as(adminToken))
      .expect(400);
  });
});
