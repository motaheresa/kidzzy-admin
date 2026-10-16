import type { Instructor, InstructorDetail, Me, Page } from '@kidzzy/shared';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest';
import { AppProviders } from './providers';
import { routes } from './router';

// The instructor screens (US-04) through the real routes, with the API mocked at fetch.

const admin: Me = {
  id: 'admin-1',
  name: 'Mohamed',
  email: 'admin@test.local',
  phone: null,
  roles: ['Admin'],
  permissions: ['instructors.read:any', 'instructors.manage:any'],
  mustChangePassword: false,
  academy: { id: 'a1', name: 'KidzzyCoders', timezone: 'Africa/Cairo' },
};
const instructorUser: Me = {
  ...admin,
  id: 'inst-0',
  roles: ['Instructor'],
  permissions: ['groups.read:own'],
};

const mona: Instructor = {
  id: '6f1c2c3e-1b52-4c43-9d1e-2f6b8a7c9d10',
  name: 'Mona Adel',
  email: 'mona@test.local',
  phone: '01012345678',
  isActive: true,
  createdAt: '2026-10-16T08:30:00.000Z',
};

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
const problem = (status: number, code: string, errors?: { field: string; message: string }[]) =>
  json(status, { type: 'about:blank', title: 'Error', status, code, errors });
const page = (data: Instructor[]): Page<Instructor> => ({
  data,
  meta: { page: 1, pageSize: 20, total: data.length },
});

type Handler = (url: URL, init: RequestInit) => Response;
let fetchMock: MockInstance<typeof fetch>;
let calls: { method: string; url: URL; body: unknown }[];

/** Answers "METHOD /path" (without the query); anything else is 404. */
function api(me: Me, handlers: Record<string, Handler> = {}) {
  fetchMock.mockImplementation((input, init = {}) => {
    const url = new URL(String(input), 'http://localhost');
    const method = init.method ?? 'GET';
    const path = url.pathname.replace('/api/v1', '');
    calls.push({ method, url, body: init.body ? JSON.parse(String(init.body)) : undefined });
    if (path === '/auth/me') return Promise.resolve(json(200, me));
    const handler = handlers[`${method} ${path}`];
    return Promise.resolve(handler ? handler(url, init) : problem(404, 'NOT_FOUND'));
  });
}

function renderAt(path: string) {
  const router = createMemoryRouter(routes, { initialEntries: [path] });
  render(
    <AppProviders>
      <RouterProvider router={router} />
    </AppProviders>,
  );
  return router;
}

beforeEach(() => {
  calls = [];
  fetchMock = vi.spyOn(globalThis, 'fetch');
});
afterEach(() => vi.restoreAllMocks());

describe('navigation', () => {
  it('shows المدرسين to a user who may read instructors, and hides it otherwise', async () => {
    api(admin, { 'GET /instructors': () => json(200, page([])) });
    renderAt('/');
    const nav = await screen.findByRole('navigation', { name: 'الأقسام' });
    expect(within(nav).getByRole('link', { name: 'المدرسين' })).toHaveAttribute(
      'href',
      '/instructors',
    );
    expect(within(nav).getByRole('link', { name: 'الرئيسية' })).toHaveAttribute(
      'aria-current',
      'page',
    );
  });

  it('hides the link and shows the forbidden page to an instructor', async () => {
    api(instructorUser);
    renderAt('/instructors');
    expect(
      await screen.findByRole('heading', { name: 'مش مسموح لك تفتح الصفحة دي' }),
    ).toBeInTheDocument();
    const nav = screen.getByRole('navigation', { name: 'الأقسام' });
    expect(within(nav).queryByRole('link', { name: 'المدرسين' })).not.toBeInTheDocument();
  });
});

describe('instructors list', () => {
  it('lists instructors with a link to each one, and searches through the URL', async () => {
    api(admin, {
      'GET /instructors': (url) =>
        json(200, page(url.searchParams.get('search') === 'zzz' ? [] : [mona])),
    });
    const router = renderAt('/instructors');

    const link = await screen.findByRole('link', { name: 'Mona Adel' });
    expect(link).toHaveAttribute('href', `/instructors/${mona.id}`);
    expect(screen.getByText('شغال')).toBeInTheDocument();

    await userEvent.setup().type(screen.getByRole('searchbox', { name: 'دور على مدرس' }), 'zzz');
    expect(await screen.findByText('مفيش مدرس بالبحث ده')).toBeInTheDocument();
    expect(router.state.location.search).toBe('?search=zzz');
    const last = calls.filter((c) => c.url.pathname.endsWith('/instructors')).at(-1);
    expect(last?.url.searchParams.get('search')).toBe('zzz');
    expect(last?.url.searchParams.get('page')).toBe('1');
  });

  it('filters by status, kept in the URL', async () => {
    api(admin, { 'GET /instructors': () => json(200, page([mona])) });
    const router = renderAt('/instructors');
    await screen.findByRole('link', { name: 'Mona Adel' });

    await userEvent.setup().click(screen.getByRole('radio', { name: 'متوقفين' }));
    await waitFor(() => expect(router.state.location.search).toBe('?isActive=false'));
    await waitFor(() => expect(calls.at(-1)?.url.searchParams.get('isActive')).toBe('false'));
  });

  it('invites to add the first instructor when there is none', async () => {
    api(admin, { 'GET /instructors': () => json(200, page([])) });
    renderAt('/instructors');
    expect(await screen.findByText('مفيش مدرسين لسه')).toBeInTheDocument();
    expect(screen.getAllByRole('link', { name: 'اضافة مدرس' })[0]).toHaveAttribute(
      'href',
      '/instructors/new',
    );
  });
});

describe('create instructor', () => {
  it('asks for an email or a phone before sending', async () => {
    api(admin);
    renderAt('/instructors/new');
    const user = userEvent.setup();
    await user.type(await screen.findByLabelText('الاسم'), 'Mona Adel');
    await user.click(screen.getByRole('button', { name: 'اعمل كلمة سر' }));
    expect((screen.getByLabelText('كلمة سر مؤقتة') as HTMLInputElement).value).toHaveLength(10);
    await user.click(screen.getByRole('button', { name: 'اضافة المدرس' }));

    expect(screen.getByLabelText('الايميل')).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByLabelText('رقم الموبايل')).toHaveAttribute('aria-invalid', 'true');
    expect(calls.some((c) => c.method === 'POST')).toBe(false);
  });

  it('shows EMAIL_TAKEN under the email, then opens the new instructor', async () => {
    let attempts = 0;
    api(admin, {
      'POST /instructors': () => {
        attempts += 1;
        return attempts === 1 ? problem(409, 'EMAIL_TAKEN') : json(201, mona);
      },
      [`GET /instructors/${mona.id}`]: () =>
        json(200, { ...mona, groups: [] } satisfies InstructorDetail),
    });
    const router = renderAt('/instructors/new');
    const user = userEvent.setup();
    await user.type(await screen.findByLabelText('الاسم'), '  Mona Adel ');
    await user.type(screen.getByLabelText('الايميل'), 'mona@test.local');
    await user.type(screen.getByLabelText('كلمة سر مؤقتة'), 'temp-pass-1');
    await user.click(screen.getByRole('button', { name: 'اضافة المدرس' }));

    expect(await screen.findAllByText('الايميل ده مستخدم لحساب تاني')).not.toHaveLength(0);
    expect(screen.getByLabelText('الايميل')).toHaveAttribute('aria-invalid', 'true');
    // Trimmed, and the empty phone left out.
    expect(calls.find((c) => c.method === 'POST')?.body).toEqual({
      name: 'Mona Adel',
      email: 'mona@test.local',
      temporaryPassword: 'temp-pass-1',
    });

    await user.click(screen.getByRole('button', { name: 'اضافة المدرس' }));
    expect(await screen.findByRole('heading', { name: 'Mona Adel' })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe(`/instructors/${mona.id}`);
  });
});

describe('instructor detail', () => {
  it('shows the data and no groups, and deactivates after a confirmation', async () => {
    api(admin, {
      [`GET /instructors/${mona.id}`]: () => json(200, { ...mona, groups: [] }),
      [`POST /instructors/${mona.id}/deactivate`]: () => json(200, { ...mona, isActive: false }),
    });
    renderAt(`/instructors/${mona.id}`);
    const user = userEvent.setup();

    expect(await screen.findByRole('heading', { name: 'Mona Adel' })).toBeInTheDocument();
    expect(screen.getByText('mona@test.local')).toBeInTheDocument();
    expect(screen.getByText('مفيش جروبات لسه')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'ايقاف المدرس' }));
    const dialog = screen.getByRole('alertdialog', { name: 'توقف Mona Adel؟' });
    await user.click(within(dialog).getByRole('button', { name: 'ايوه، وقفه' }));

    expect(await screen.findByText('متوقف')).toBeInTheDocument();
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'تشغيل المدرس تاني' })).toBeInTheDocument();
    expect(calls.filter((c) => c.method === 'POST').map((c) => c.url.pathname)).toEqual([
      `/api/v1/instructors/${mona.id}/deactivate`,
    ]);
  });

  it('says so when the instructor does not exist', async () => {
    api(admin);
    renderAt(`/instructors/${mona.id}`);
    expect(await screen.findByText('المدرس ده مش موجود')).toBeInTheDocument();
  });

  it('edits the data and sends null for an emptied field', async () => {
    api(admin, {
      [`GET /instructors/${mona.id}`]: () => json(200, { ...mona, groups: [] }),
      [`PATCH /instructors/${mona.id}`]: () => json(200, { ...mona, phone: null }),
    });
    const router = renderAt(`/instructors/${mona.id}/edit`);
    const user = userEvent.setup();
    const phone = await screen.findByLabelText('رقم الموبايل');
    expect(phone).toHaveValue('01012345678');
    await user.clear(phone);
    await user.click(screen.getByRole('button', { name: 'حفظ' }));

    await waitFor(() => expect(router.state.location.pathname).toBe(`/instructors/${mona.id}`));
    expect(calls.find((c) => c.method === 'PATCH')?.body).toEqual({
      name: 'Mona Adel',
      email: 'mona@test.local',
      phone: null,
    });
  });
});
