import type { Me, Page, Student } from '@kidzzy/shared';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest';
import { AppProviders } from './providers';
import { routes } from './router';

// The student screens (US-05) through the real routes, with the API mocked at fetch.

const admin: Me = {
  id: 'admin-1',
  name: 'Mohamed',
  email: 'admin@test.local',
  phone: null,
  roles: ['Admin'],
  permissions: ['students.read:any', 'students.manage:any', 'instructors.read:any'],
  mustChangePassword: false,
  academy: { id: 'a1', name: 'KidzzyCoders', timezone: 'Africa/Cairo' },
};
const instructorUser: Me = {
  ...admin,
  id: 'inst-1',
  roles: ['Instructor'],
  permissions: ['students.read:own', 'groups.read:own'],
};

const student: Student = {
  id: '0b6c7e3a-77d1-4d38-9a4e-5f1a2b3c4d5e',
  code: 'KC-001',
  name: 'طالب 1',
  age: 9,
  parentName: 'ولي امر 1',
  parentPhone: '01012345678',
  notes: null,
  isActive: true,
  currentGroup: null,
  currentCycle: null,
};

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
const problem = (status: number, code: string) =>
  json(status, { type: 'about:blank', title: 'Error', status, code });
const page = (data: Student[]): Page<Student> => ({
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
  it('shows الطلاب before المدرسين, in the wireframe’s order', async () => {
    api(admin, { 'GET /students': () => json(200, page([])) });
    renderAt('/');
    const nav = await screen.findByRole('navigation', { name: 'الأقسام' });
    expect(
      within(nav)
        .getAllByRole('link')
        .map((link) => link.textContent),
    ).toEqual(['الرئيسية', 'الطلاب', 'المدرسين']);
  });
});

describe('students list', () => {
  it('lists students with a link to each one, and filters by status in the URL', async () => {
    api(admin, { 'GET /students': () => json(200, page([student])) });
    const router = renderAt('/students');

    expect(await screen.findByRole('link', { name: 'طالب 1' })).toHaveAttribute(
      'href',
      `/students/${student.id}`,
    );
    expect(screen.getByText('KC-001')).toBeInTheDocument();
    expect(screen.getByText('نشط')).toBeInTheDocument();

    await userEvent.setup().click(screen.getByRole('radio', { name: 'متوقفين' }));
    await waitFor(() => expect(router.state.location.search).toBe('?isActive=false'));
    await waitFor(() => expect(calls.at(-1)?.url.searchParams.get('isActive')).toBe('false'));
  });

  it('tells an instructor that their students will appear here, with no add button', async () => {
    api(instructorUser, { 'GET /students': () => json(200, page([])) });
    renderAt('/students');
    expect(await screen.findByText('مفيش طلاب في جروباتك لسه')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'اضافة طالب' })).not.toBeInTheDocument();
  });

  it('shows the forbidden page to an instructor opening the new-student screen', async () => {
    api(instructorUser);
    renderAt('/students/new');
    expect(
      await screen.findByRole('heading', { name: 'مش مسموح لك تفتح الصفحة دي' }),
    ).toBeInTheDocument();
  });
});

describe('create student', () => {
  it('shows STUDENT_CODE_TAKEN under the code, then opens the new student', async () => {
    let attempts = 0;
    api(admin, {
      'POST /students': () => {
        attempts += 1;
        return attempts === 1 ? problem(409, 'STUDENT_CODE_TAKEN') : json(201, student);
      },
      [`GET /students/${student.id}`]: () => json(200, student),
    });
    const router = renderAt('/students/new');
    const user = userEvent.setup();
    await user.type(await screen.findByLabelText('الكود'), ' kc-001 ');
    await user.type(screen.getByLabelText('اسم الطالب'), 'طالب 1');
    await user.type(screen.getByLabelText('اسم ولي الامر'), 'ولي امر 1');
    await user.type(screen.getByLabelText('رقم ولي الامر'), '01012345678');
    await user.click(screen.getByRole('button', { name: 'اضافة الطالب' }));

    expect(screen.getByLabelText('الكود')).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getByLabelText('الكود')).toHaveAttribute('aria-invalid', 'true'),
    );
    expect(screen.getAllByText('كود الطالب ده مستخدم قبل كده').length).toBeGreaterThan(0);
    // Trimmed; no age and no notes are left out of the body.
    expect(calls.find((c) => c.method === 'POST')?.body).toEqual({
      code: 'kc-001',
      name: 'طالب 1',
      parentName: 'ولي امر 1',
      parentPhone: '01012345678',
    });

    await user.click(screen.getByRole('button', { name: 'اضافة الطالب' }));
    expect(await screen.findByRole('heading', { name: 'طالب 1' })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe(`/students/${student.id}`);
  });
});

describe('student profile', () => {
  it('shows the data and deactivates after a confirmation', async () => {
    api(admin, {
      [`GET /students/${student.id}`]: () => json(200, student),
      [`POST /students/${student.id}/deactivate`]: () => json(200, { ...student, isActive: false }),
    });
    renderAt(`/students/${student.id}`);
    const user = userEvent.setup();

    expect(await screen.findByRole('heading', { name: 'طالب 1' })).toBeInTheDocument();
    expect(screen.getByText('مش في جروب')).toBeInTheDocument();
    expect(screen.getByText('ولي امر 1')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'ايقاف الطالب' }));
    const dialog = screen.getByRole('alertdialog', { name: 'توقف طالب 1؟' });
    await user.click(within(dialog).getByRole('button', { name: 'ايوه، وقفه' }));

    expect(await screen.findByText('متوقف')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'ايقاف الطالب' })).not.toBeInTheDocument();
  });

  it('says so when the student does not exist', async () => {
    api(admin);
    renderAt(`/students/${student.id}`);
    expect(await screen.findByText('الطالب ده مش موجود')).toBeInTheDocument();
  });

  it('edits the data, sending null for an emptied age', async () => {
    api(admin, {
      [`GET /students/${student.id}`]: () => json(200, student),
      [`PATCH /students/${student.id}`]: () => json(200, { ...student, age: null }),
    });
    const router = renderAt(`/students/${student.id}/edit`);
    const user = userEvent.setup();
    const age = await screen.findByLabelText('السن');
    expect(age).toHaveValue(9);
    await user.clear(age);
    await user.click(screen.getByRole('button', { name: 'حفظ' }));

    await waitFor(() => expect(router.state.location.pathname).toBe(`/students/${student.id}`));
    expect(calls.find((c) => c.method === 'PATCH')?.body).toEqual({
      code: 'KC-001',
      name: 'طالب 1',
      age: null,
      parentName: 'ولي امر 1',
      parentPhone: '01012345678',
      notes: null,
    });
  });
});
