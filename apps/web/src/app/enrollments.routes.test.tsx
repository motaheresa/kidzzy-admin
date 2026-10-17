import type { Enrollment, Group, Me, Page, Student } from '@kidzzy/shared';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest';
import { AppProviders } from './providers';
import { routes } from './router';

// Enrolling a student (US-08, US-36) and what it shows: the group's students and the student's
// group and cycle, through the real routes, with the API mocked at fetch.

const admin: Me = {
  id: 'admin-1',
  name: 'Mohamed',
  email: 'admin@test.local',
  phone: null,
  roles: ['Admin'],
  permissions: [
    'groups.read:any',
    'groups.update:any',
    'students.read:any',
    'students.manage:any',
    'enrollments.manage:any',
  ],
  mustChangePassword: false,
  academy: { id: 'a1', name: 'KidzzyCoders', timezone: 'Africa/Cairo' },
};
const instructorUser: Me = {
  ...admin,
  id: 'ana-id',
  roles: ['Instructor'],
  permissions: ['groups.read:own', 'students.read:own'],
};

const group: Group = {
  id: '3c1d2e4f-5a6b-4c7d-8e9f-0a1b2c3d4e5f',
  name: 'جروب A',
  level: 'Scratch 1',
  instructor: { id: 'ana-id', name: 'Ana' },
  startDate: '2026-10-01',
  isActive: true,
  schedule: [{ weekday: 4, startTime: '17:00', durationMin: 60 }],
  studentCount: 1,
  heldCount: 0,
  nextSessionAt: null,
};
const mona: Student = {
  id: '7f0e4b1a-2c3d-4e5f-8a9b-0c1d2e3f4a5b',
  code: 'KC-001',
  name: 'منى',
  age: 9,
  parentName: 'ولي',
  parentPhone: '01012345678',
  notes: null,
  isActive: true,
  currentGroup: null,
  currentCycle: null,
};
const omar: Student = {
  ...mona,
  id: '1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d',
  code: 'KC-002',
  name: 'عمر',
  currentGroup: { id: 'g2', name: 'جروب B' },
};
const enrollment: Enrollment = {
  id: 'e1',
  studentId: mona.id,
  studentName: mona.name,
  group: { id: group.id, name: group.name },
  startDate: '2026-10-10',
  endDate: null,
};

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
const problem = (status: number, code: string, errors?: { field: string; message: string }[]) =>
  json(status, { type: 'about:blank', title: 'Error', status, code, errors });
const page = <T,>(data: T[]): Page<T> => ({
  data,
  meta: { page: 1, pageSize: 10, total: data.length },
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

const groupHandlers = (enrollments: Enrollment[]): Record<string, Handler> => ({
  [`GET /groups/${group.id}`]: () => json(200, group),
  [`GET /groups/${group.id}/enrollments`]: () => json(200, { data: enrollments }),
});

beforeEach(() => {
  calls = [];
  fetchMock = vi.spyOn(globalThis, 'fetch');
});
afterEach(() => vi.restoreAllMocks());

describe('the group’s students', () => {
  it('lists them with a link each, and offers the admin to enroll one', async () => {
    api(admin, groupHandlers([enrollment]));
    renderAt(`/groups/${group.id}`);
    expect(await screen.findByRole('link', { name: 'منى' })).toHaveAttribute(
      'href',
      `/students/${mona.id}`,
    );
    expect(screen.getByRole('link', { name: 'تسجيل طالب' })).toHaveAttribute(
      'href',
      `/groups/${group.id}/enroll`,
    );
  });

  it('shows an instructor their group’s students, with no enroll button', async () => {
    api(instructorUser, groupHandlers([]));
    renderAt(`/groups/${group.id}`);
    expect(await screen.findByText('مفيش طلاب في الجروب لسه')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'تسجيل طالب' })).not.toBeInTheDocument();
  });
});

describe('enrolling a student', () => {
  it('searches the active students and sends the plan with the amount as a decimal string', async () => {
    api(admin, {
      ...groupHandlers([enrollment]),
      'GET /students': () => json(200, page([mona, omar])),
      [`POST /groups/${group.id}/enrollments`]: () => json(201, enrollment),
    });
    const router = renderAt(`/groups/${group.id}/enroll`);
    const user = userEvent.setup();

    const picker = await screen.findByLabelText('الطالب');
    // A student already in a group cannot be picked.
    expect(await within(picker).findByRole('option', { name: /عمر/ })).toBeDisabled();
    await user.selectOptions(picker, 'منى · KC-001');
    await user.clear(screen.getByLabelText('تاريخ البداية'));
    await user.type(screen.getByLabelText('تاريخ البداية'), '2026-10-10');
    await user.type(screen.getByLabelText('عدد سيشنات الدورة'), '4');
    await user.type(screen.getByLabelText('مبلغ الدورة (جنيه)'), '1,500');
    await user.clear(screen.getByLabelText('نقطة البداية'));
    await user.type(screen.getByLabelText('نقطة البداية'), '2');
    await user.click(screen.getByRole('button', { name: 'تسجيل الطالب' }));

    await waitFor(() => expect(router.state.location.pathname).toBe(`/groups/${group.id}`));
    expect(calls.find((c) => c.method === 'POST')?.body).toEqual({
      studentId: mona.id,
      startDate: '2026-10-10',
      plan: { sessionsPerCycle: 4, amount: '1500.00' },
      openingCount: 2,
    });
    const studentSearch = calls.find((c) => c.url.pathname.endsWith('/students'));
    expect(studentSearch?.url.searchParams.get('isActive')).toBe('true');
  });

  it('shows the API’s answer under the field it is about', async () => {
    api(admin, {
      ...groupHandlers([]),
      'GET /students': () => json(200, page([mona])),
      [`POST /groups/${group.id}/enrollments`]: () => problem(422, 'STARTING_POINT_OUT_OF_RANGE'),
    });
    renderAt(`/groups/${group.id}/enroll`);
    const user = userEvent.setup();
    const picker = await screen.findByLabelText('الطالب');
    await within(picker).findByRole('option', { name: /منى/ });
    await user.selectOptions(picker, 'منى · KC-001');
    await user.type(screen.getByLabelText('عدد سيشنات الدورة'), '4');
    await user.type(screen.getByLabelText('مبلغ الدورة (جنيه)'), '1500');
    await user.clear(screen.getByLabelText('نقطة البداية'));
    await user.type(screen.getByLabelText('نقطة البداية'), '4');
    await user.click(screen.getByRole('button', { name: 'تسجيل الطالب' }));

    await waitFor(() =>
      expect(screen.getByLabelText('نقطة البداية')).toHaveAttribute('aria-invalid', 'true'),
    );
    expect(
      screen.getAllByText('نقطة البداية لازم تكون اقل من عدد سيشنات الدورة').length,
    ).toBeGreaterThan(0);
  });

  it('shows the forbidden page to an instructor', async () => {
    api(instructorUser, groupHandlers([]));
    renderAt(`/groups/${group.id}/enroll`);
    expect(
      await screen.findByRole('heading', { name: 'مش مسموح لك تفتح الصفحة دي' }),
    ).toBeInTheDocument();
  });
});

describe('the student profile', () => {
  it('shows the current group as a link and the cycle in progress', async () => {
    api(admin, {
      [`GET /students/${mona.id}`]: () =>
        json(200, {
          ...mona,
          currentGroup: { id: group.id, name: group.name },
          currentCycle: {
            id: 'c1',
            payeeType: 'student',
            payeeId: mona.id,
            payeeName: mona.name,
            cycleNumber: 1,
            sessionsPerCycle: 4,
            amount: '1500.00',
            openingCount: 2,
            sessionsCounted: 2,
            status: 'in_progress',
            dueAt: null,
            paidAt: null,
          },
        } satisfies Student),
    });
    renderAt(`/students/${mona.id}`);
    expect(await screen.findByRole('link', { name: 'جروب A' })).toHaveAttribute(
      'href',
      `/groups/${group.id}`,
    );
    expect(screen.getByText('الدورة الحالية')).toBeInTheDocument();
    expect(screen.getByText('2 من 4')).toBeInTheDocument();
    expect(screen.getByText(/1,500\.00/)).toBeInTheDocument();
    expect(screen.getByText('شغالة')).toBeInTheDocument();
  });
});
