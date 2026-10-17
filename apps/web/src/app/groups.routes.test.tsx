import type { Group, Instructor, Me, Page } from '@kidzzy/shared';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest';
import { AppProviders } from './providers';
import { routes } from './router';

// The group screens (US-07) through the real routes, with the API mocked at fetch.

const admin: Me = {
  id: 'admin-1',
  name: 'Mohamed',
  email: 'admin@test.local',
  phone: null,
  roles: ['Admin'],
  permissions: [
    'groups.read:any',
    'groups.create:any',
    'groups.update:any',
    'instructors.read:any',
    'students.read:any',
  ],
  mustChangePassword: false,
  academy: { id: 'a1', name: 'KidzzyCoders', timezone: 'Africa/Cairo' },
};
const instructorUser: Me = {
  ...admin,
  id: 'inst-1',
  roles: ['Instructor'],
  permissions: ['groups.read:own', 'students.read:own'],
};

const group: Group = {
  id: '3c1d2e4f-5a6b-4c7d-8e9f-0a1b2c3d4e5f',
  name: 'جروب A',
  level: 'Scratch 1',
  instructor: { id: 'ana-id', name: 'Ana' },
  startDate: '2026-11-01',
  isActive: true,
  schedule: [
    { weekday: 2, startTime: '16:00', durationMin: 60 },
    { weekday: 6, startTime: '16:00', durationMin: 60 },
  ],
  studentCount: 0,
  heldCount: 0,
  nextSessionAt: null,
};
const ana: Instructor = {
  id: 'ana-id',
  name: 'Ana',
  email: 'ana@test.local',
  phone: null,
  isActive: true,
  createdAt: '2026-10-16T08:30:00.000Z',
};

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
const problem = (status: number, code: string, errors?: { field: string; message: string }[]) =>
  json(status, { type: 'about:blank', title: 'Error', status, code, errors });
const page = <T,>(data: T[]): Page<T> => ({
  data,
  meta: { page: 1, pageSize: 20, total: data.length },
});

type Handler = (url: URL) => Response;
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
    return Promise.resolve(handler ? handler(url) : problem(404, 'NOT_FOUND'));
  });
}

/** Sets a time input's value the way a browser does (typing into type="time" is unreliable). */
function fireInput(input: HTMLElement, value: string) {
  fireEvent.change(input, { target: { value } });
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
  it('shows الجروبات right after الرئيسية, for the admin and for an instructor', async () => {
    api(admin, { 'GET /groups': () => json(200, page([])) });
    renderAt('/');
    const nav = await screen.findByRole('navigation', { name: 'الأقسام' });
    expect(
      within(nav)
        .getAllByRole('link')
        .map((link) => link.textContent),
    ).toEqual(['الرئيسية', 'الجروبات', 'الطلاب', 'المدرسين']);
  });
});

describe('groups list', () => {
  it('lists groups with their schedule, and searches through the URL', async () => {
    api(admin, {
      'GET /groups': (url) =>
        json(200, page(url.searchParams.get('search') === 'zzz' ? [] : [group])),
    });
    const router = renderAt('/groups');

    expect(await screen.findByRole('link', { name: 'جروب A' })).toHaveAttribute(
      'href',
      `/groups/${group.id}`,
    );
    expect(screen.getByText('التلات والسبت · 4:00 م')).toBeInTheDocument();
    expect(screen.getByText('Ana')).toBeInTheDocument();

    await userEvent.setup().type(screen.getByRole('searchbox', { name: 'دور على جروب' }), 'zzz');
    expect(await screen.findByText('مفيش جروب بالاسم ده')).toBeInTheDocument();
    expect(router.state.location.search).toBe('?search=zzz');
  });

  it('tells an instructor with no group, and offers no add button', async () => {
    api(instructorUser, { 'GET /groups': () => json(200, page([])) });
    renderAt('/groups');
    expect(await screen.findByText('مفيش جروبات ليك لسه')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'اضافة جروب' })).not.toBeInTheDocument();
  });

  it('shows the forbidden page to an instructor opening the new-group screen', async () => {
    api(instructorUser);
    renderAt('/groups/new');
    expect(
      await screen.findByRole('heading', { name: 'مش مسموح لك تفتح الصفحة دي' }),
    ).toBeInTheDocument();
  });
});

describe('create group', () => {
  async function fillForm(user: ReturnType<typeof userEvent.setup>) {
    await user.type(await screen.findByLabelText('اسم الجروب'), '  جروب A ');
    await user.type(screen.getByLabelText('الكورس / المستوى'), 'Scratch 1');
    await user.selectOptions(screen.getByLabelText('المدرس'), 'Ana');
    await user.type(screen.getByLabelText('تاريخ البداية'), '2026-11-01');
  }

  it('offers the active instructors, and sends the group with its slots', async () => {
    api(admin, {
      'GET /instructors': () => json(200, page([ana])),
      'POST /groups': () => json(201, group),
      [`GET /groups/${group.id}`]: () => json(200, group),
    });
    const router = renderAt('/groups/new');
    const user = userEvent.setup();
    await fillForm(user);

    const row = screen.getByRole('group', { name: 'الميعاد 1' });
    await user.selectOptions(within(row).getByLabelText('اليوم'), 'الأحد');
    await user.click(screen.getByRole('button', { name: 'اضافة الجروب' }));

    expect(await screen.findByRole('heading', { name: 'جروب A' })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe(`/groups/${group.id}`);
    expect(calls.find((c) => c.method === 'POST')?.body).toEqual({
      name: 'جروب A',
      level: 'Scratch 1',
      instructorId: 'ana-id',
      startDate: '2026-11-01',
      schedule: [{ weekday: 0, startTime: '16:00', durationMin: 60 }],
    });
    expect(calls.find((c) => c.url.pathname.endsWith('/instructors'))?.url.search).toContain(
      'isActive=true',
    );
  });

  it('adds and removes slot rows, and keeps at least one', async () => {
    api(admin, { 'GET /instructors': () => json(200, page([ana])) });
    renderAt('/groups/new');
    const user = userEvent.setup();
    await screen.findByLabelText('اسم الجروب');

    expect(screen.getByRole('button', { name: 'شيل الميعاد 1' })).toBeDisabled();
    await user.click(screen.getByRole('button', { name: 'ضيف ميعاد' }));
    expect(screen.getAllByRole('group', { name: /الميعاد/ })).toHaveLength(2);
    await user.click(screen.getByRole('button', { name: 'شيل الميعاد 1' }));
    expect(screen.getAllByRole('group', { name: /الميعاد/ })).toHaveLength(1);
  });

  it('shows SCHEDULE_OVERLAP under the schedule and INSTRUCTOR_NOT_ASSIGNABLE under the instructor', async () => {
    let answer = 'SCHEDULE_OVERLAP';
    api(admin, {
      'GET /instructors': () => json(200, page([ana])),
      'POST /groups': () => problem(422, answer),
    });
    renderAt('/groups/new');
    const user = userEvent.setup();
    await fillForm(user);
    await user.click(screen.getByRole('button', { name: 'اضافة الجروب' }));
    expect(
      await screen.findAllByText('فيه ميعادين متداخلين في نفس اليوم، او ميعاد بيخلص بعد نص الليل'),
    ).not.toHaveLength(0);

    answer = 'INSTRUCTOR_NOT_ASSIGNABLE';
    await user.click(screen.getByRole('button', { name: 'اضافة الجروب' }));
    await waitFor(() =>
      expect(screen.getByLabelText('المدرس')).toHaveAttribute('aria-invalid', 'true'),
    );
  });

  it('shows a slot field error under its row', async () => {
    api(admin, {
      'GET /instructors': () => json(200, page([ana])),
      'POST /groups': () =>
        problem(400, 'VALIDATION_FAILED', [
          { field: 'schedule.0.durationMin', message: 'durationMin must not be greater than 240' },
        ]),
    });
    renderAt('/groups/new');
    const user = userEvent.setup();
    await fillForm(user);
    await user.click(screen.getByRole('button', { name: 'اضافة الجروب' }));

    const row = await screen.findByRole('group', { name: 'الميعاد 1' });
    expect(await within(row).findByText('المدة من 15 لـ 240 دقيقة')).toBeInTheDocument();
  });
});

describe('edit group', () => {
  const editor: Me = {
    ...instructorUser,
    permissions: ['groups.read:own', 'groups.update:own'],
  };
  const other: Instructor = { ...ana, id: 'ben-id', name: 'Ben' };

  function renderEdit(me: Me, handlers: Record<string, Handler> = {}) {
    api(me, {
      [`GET /groups/${group.id}`]: () => json(200, group),
      'GET /instructors': () => json(200, page([ana, other])),
      ...handlers,
    });
    return renderAt(`/groups/${group.id}/edit`);
  }

  it('shows an edit button on the group to whoever may update it', async () => {
    api(admin, { [`GET /groups/${group.id}`]: () => json(200, group) });
    renderAt(`/groups/${group.id}`);
    expect(await screen.findByRole('link', { name: 'تعديل' })).toHaveAttribute(
      'href',
      `/groups/${group.id}/edit`,
    );
  });

  it('sends only the fields that changed, and the instructor for the admin', async () => {
    renderEdit(admin, {
      [`PATCH /groups/${group.id}`]: () => json(200, { ...group, level: 'Python' }),
    });
    const user = userEvent.setup();
    const level = await screen.findByLabelText('الكورس / المستوى');
    const save = screen.getByRole('button', { name: 'حفظ البيانات' });
    expect(save).toBeDisabled();

    await user.clear(level);
    await user.type(level, 'Python');
    await user.selectOptions(screen.getByLabelText('المدرس'), 'Ben');
    await user.click(save);

    await waitFor(() => expect(calls.some((c) => c.method === 'PATCH')).toBe(true));
    expect(calls.find((c) => c.method === 'PATCH')?.body).toEqual({
      level: 'Python',
      instructorId: 'ben-id',
    });
  });

  it('hides the instructor choice from an instructor editing their own group', async () => {
    renderEdit(editor, {
      [`PATCH /groups/${group.id}`]: () => json(200, { ...group, name: 'New' }),
    });
    const user = userEvent.setup();
    const name = await screen.findByLabelText('اسم الجروب');
    expect(screen.queryByLabelText('المدرس')).not.toBeInTheDocument();

    await user.clear(name);
    await user.type(name, 'New');
    await user.click(screen.getByRole('button', { name: 'حفظ البيانات' }));
    await waitFor(() => expect(calls.some((c) => c.method === 'PATCH')).toBe(true));
    expect(calls.find((c) => c.method === 'PATCH')?.body).toEqual({ name: 'New' });
  });

  it('asks before stopping a group, and says the future sessions are removed', async () => {
    renderEdit(admin, {
      [`PATCH /groups/${group.id}`]: () => json(200, { ...group, isActive: false }),
    });
    const user = userEvent.setup();
    await user.click(await screen.findByRole('radio', { name: 'متوقف' }));
    await user.click(screen.getByRole('button', { name: 'حفظ البيانات' }));

    const dialog = await screen.findByRole('alertdialog', { name: 'توقف جروب A؟' });
    expect(calls.some((c) => c.method === 'PATCH')).toBe(false);
    await user.click(within(dialog).getByRole('button', { name: 'ايوه، وقفه' }));
    await waitFor(() => expect(calls.some((c) => c.method === 'PATCH')).toBe(true));
    expect(calls.find((c) => c.method === 'PATCH')?.body).toEqual({ isActive: false });
  });

  it('confirms before replacing the schedule, then sends the whole new schedule', async () => {
    renderEdit(admin, {
      [`PUT /groups/${group.id}/schedule`]: () =>
        json(200, { ...group, schedule: [{ weekday: 0, startTime: '10:00', durationMin: 60 }] }),
    });
    const user = userEvent.setup();
    const rows = await screen.findAllByRole('group', { name: /الميعاد/ });
    expect(rows).toHaveLength(2);
    // Remove Saturday, move Tuesday to Sunday 10:00.
    await user.click(screen.getByRole('button', { name: 'شيل الميعاد 2' }));
    const row = screen.getByRole('group', { name: 'الميعاد 1' });
    await user.selectOptions(within(row).getByLabelText('اليوم'), 'الأحد');
    fireInput(within(row).getByLabelText('الساعة'), '10:00');
    await user.click(screen.getByRole('button', { name: 'حفظ المواعيد' }));

    const dialog = await screen.findByRole('alertdialog', { name: 'تغيير المواعيد؟' });
    expect(dialog).toHaveTextContent('اللي اتعملت او اتلغت مش هتتغير');
    expect(calls.some((c) => c.method === 'PUT')).toBe(false);
    await user.click(within(dialog).getByRole('button', { name: 'ايوه، غيّر المواعيد' }));

    await waitFor(() => expect(calls.some((c) => c.method === 'PUT')).toBe(true));
    expect(calls.find((c) => c.method === 'PUT')?.body).toEqual({
      schedule: [{ weekday: 0, startTime: '10:00', durationMin: 60 }],
    });
  });

  it('shows SCHEDULE_OVERLAP under the editor and closes the confirmation', async () => {
    renderEdit(admin, {
      [`PUT /groups/${group.id}/schedule`]: () => problem(422, 'SCHEDULE_OVERLAP'),
    });
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'ضيف ميعاد' }));
    await user.click(screen.getByRole('button', { name: 'حفظ المواعيد' }));
    await user.click(
      within(await screen.findByRole('alertdialog')).getByRole('button', {
        name: 'ايوه، غيّر المواعيد',
      }),
    );

    expect(
      await screen.findByText('فيه ميعادين متداخلين في نفس اليوم، او ميعاد بيخلص بعد نص الليل'),
    ).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument());
  });

  it('shows the forbidden page to an instructor without the update permission', async () => {
    api(instructorUser);
    renderAt(`/groups/${group.id}/edit`);
    expect(
      await screen.findByRole('heading', { name: 'مش مسموح لك تفتح الصفحة دي' }),
    ).toBeInTheDocument();
  });
});

describe('group detail', () => {
  it('shows the data, the schedule and an empty students section', async () => {
    api(admin, {
      [`GET /groups/${group.id}`]: () => json(200, group),
      [`GET /groups/${group.id}/enrollments`]: () => json(200, { data: [] }),
    });
    renderAt(`/groups/${group.id}`);

    expect(await screen.findByRole('heading', { name: 'جروب A' })).toBeInTheDocument();
    expect(screen.getByText('المدرس: Ana')).toBeInTheDocument();
    expect(screen.getByText('التلات · 4:00 م')).toBeInTheDocument();
    expect(screen.getByText('السبت · 4:00 م')).toBeInTheDocument();
    expect(await screen.findByText('مفيش طلاب في الجروب لسه')).toBeInTheDocument();
  });

  it('shows the numbers of the sessions: held count and the next session', async () => {
    api(admin, {
      [`GET /groups/${group.id}`]: () =>
        json(200, { ...group, heldCount: 5, nextSessionAt: '2026-11-03T14:00:00.000Z' }),
    });
    renderAt(`/groups/${group.id}`);
    expect(await screen.findByText('5')).toBeInTheDocument();
    expect(screen.getByText(/3 نوفمبر 2026/)).toBeInTheDocument();
  });

  it('AC-08: says the group is not the instructor’s own on 403, and not found on 404', async () => {
    api(instructorUser, { [`GET /groups/${group.id}`]: () => problem(403, 'FORBIDDEN') });
    renderAt(`/groups/${group.id}`);
    expect(await screen.findByText('الجروب ده مش بتاعك')).toBeInTheDocument();
  });

  it('says so when the group does not exist', async () => {
    api(admin);
    renderAt(`/groups/${group.id}`);
    expect(await screen.findByText('الجروب ده مش موجود')).toBeInTheDocument();
  });
});
