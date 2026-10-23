import type { GroupAttendance, Me, Page, StudentAttendanceItem } from '@kidzzy/shared';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest';
import { AppProviders } from './providers';
import { routes } from './router';

// The attendance grid of a group and the attendance list of a student (US-19), through the real
// routes with the API mocked at fetch. Only the attendance endpoints are mocked: the rest of
// each page answers 404, which the other sections explain by themselves.

const groupId = '3c1d2e4f-5a6b-4c7d-8e9f-0a1b2c3d4e5f';
const studentId = '9d8c7b6a-5f4e-4d3c-8b2a-1f0e9d8c7b6a';
const sessionOne = '8a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d';
const sessionTwo = '7b2c3d4e-5f6a-4b7c-9d8e-0f1a2b3c4d5e';

const admin: Me = {
  id: 'admin-1',
  name: 'Mohamed',
  email: 'admin@test.local',
  phone: null,
  roles: ['Admin'],
  permissions: ['attendance.read:any', 'sessions.read:any', 'groups.read:any', 'students.read:any'],
  mustChangePassword: false,
  academy: { id: 'a1', name: 'KidzzyCoders', timezone: 'Africa/Cairo' },
};
const noAttendance: Me = { ...admin, permissions: ['groups.read:any', 'students.read:any'] };

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
const problem = (status: number, code: string) =>
  json(status, { type: 'about:blank', title: 'Error', status, code });

const session = (id: string, scheduledAt: string, sessionNumber: number) => ({
  id,
  group: { id: groupId, name: 'جروب A' },
  instructorId: 'inst-1',
  scheduledAt,
  durationMin: 60,
  status: 'held' as const,
  sessionNumber,
  isMakeup: false,
  compensatesSessionId: null,
  cancelReason: null,
});

const grid: GroupAttendance = {
  sessions: [
    session(sessionOne, '2026-10-08T14:00:00.000Z', 1),
    session(sessionTwo, '2026-10-15T14:00:00.000Z', 2),
  ],
  students: [
    {
      student: { id: 's1', code: 'KC-001', name: 'Amal' },
      records: [
        { sessionId: sessionOne, status: 'present', performanceRating: 5, homeworkRating: null },
        { sessionId: sessionTwo, status: 'present', performanceRating: 3, homeworkRating: 4 },
      ],
    },
    {
      student: { id: 's2', code: 'KC-002', name: 'Mona' },
      records: [
        { sessionId: sessionOne, status: 'absent', performanceRating: null, homeworkRating: null },
      ],
    },
  ],
};

const item = (
  id: string,
  scheduledAt: string,
  sessionNumber: number,
  status: 'present' | 'absent',
): StudentAttendanceItem => ({
  sessionId: id,
  scheduledAt,
  sessionNumber,
  group: { id: groupId, name: 'جروب A' },
  status,
  performanceRating: status === 'present' ? 4 : null,
  homeworkRating: null,
});

type Handler = (url: URL) => Response;
let fetchMock: MockInstance<typeof fetch>;
let calls: { method: string; url: URL }[];

function api(me: Me, handlers: Record<string, Handler> = {}) {
  fetchMock.mockImplementation((input, init = {}) => {
    const url = new URL(String(input), 'http://localhost');
    const method = init.method ?? 'GET';
    const path = url.pathname.replace('/api/v1', '');
    calls.push({ method, url });
    if (path === '/auth/me') return Promise.resolve(json(200, me));
    const handler = handlers[method + ' ' + path];
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

const attendanceCalls = () => calls.filter((call) => call.url.pathname.endsWith('/attendance'));

beforeEach(() => {
  calls = [];
  fetchMock = vi.spyOn(globalThis, 'fetch');
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe("a group's attendance grid", () => {
  const groupPath = '/groups/' + groupId;
  const gridPath = 'GET ' + groupPath + '/attendance';

  it('shows students by Held sessions with the marks and the ratings', async () => {
    api(admin, { [gridPath]: () => json(200, grid) });
    renderAt(groupPath);

    expect(await screen.findByText('جدول الحضور')).toBeInTheDocument();
    const table = await screen.findByRole('table', {}, { timeout: 3000 });
    const rows = within(table).getAllByRole('row');
    // A header row and one row per student.
    expect(rows).toHaveLength(3);
    expect(
      within(rows[0]!)
        .getAllByRole('link')
        .map((link) => link.getAttribute('href')),
    ).toEqual(['/sessions/' + sessionOne, '/sessions/' + sessionTwo]);
    const amal = within(rows[1]!);
    expect(amal.getByText('Amal')).toBeInTheDocument();
    expect(amal.getAllByText('حاضر')).toHaveLength(2);
    expect(amal.getByText(/الأداء 5 · الواجب مفيش واجب/)).toBeInTheDocument();
    expect(amal.getByText(/الأداء 3 · الواجب 4/)).toBeInTheDocument();
    const mona = within(rows[2]!);
    expect(mona.getByText('غايب')).toBeInTheDocument();
    expect(mona.getByLabelText('ما اتسجلش')).toBeInTheDocument();
  });

  it('keeps the date range in the URL and sends it', async () => {
    api(admin, { [gridPath]: () => json(200, grid) });
    const router = renderAt(groupPath);
    await screen.findByRole('table', {}, { timeout: 3000 });

    fireEvent.change(screen.getByLabelText('من'), { target: { value: '2026-10-01' } });
    fireEvent.change(screen.getByLabelText('إلى'), { target: { value: '2026-10-31' } });

    await waitFor(() =>
      expect(router.state.location.search).toBe('?from=2026-10-01&to=2026-10-31'),
    );
    await waitFor(() => {
      const last = attendanceCalls().at(-1)?.url.searchParams;
      expect(last?.get('from')).toBe('2026-10-01');
      expect(last?.get('to')).toBe('2026-10-31');
    });

    await userEvent.setup().click(screen.getByRole('button', { name: 'امسح الفلتر' }));
    await waitFor(() => expect(router.state.location.search).toBe(''));
  });

  it('starts from the range in the URL', async () => {
    api(admin, { [gridPath]: () => json(200, grid) });
    renderAt(groupPath + '?from=2026-10-05&to=2026-10-20');

    await screen.findByRole('table', {}, { timeout: 3000 });
    expect(screen.getByLabelText('من')).toHaveValue('2026-10-05');
    expect(attendanceCalls()[0]?.url.searchParams.get('to')).toBe('2026-10-20');
  });

  it('says a backwards range is wrong and does not ask the API', async () => {
    api(admin, { [gridPath]: () => json(200, grid) });
    renderAt(groupPath + '?from=2026-10-20&to=2026-10-05');

    expect(await screen.findByText('تاريخ البداية بعد تاريخ النهاية')).toBeInTheDocument();
    expect(attendanceCalls()).toHaveLength(0);
  });

  it('says there is nothing in the range', async () => {
    api(admin, { [gridPath]: () => json(200, { sessions: [], students: [] }) });
    renderAt(groupPath + '?from=2026-10-05');

    expect(await screen.findByText('مفيش حصص اتعملت في الفترة دي')).toBeInTheDocument();
    expect(screen.getByText('جرب فترة تانية.')).toBeInTheDocument();
  });

  it('stays hidden, and does not ask, without attendance.read', async () => {
    api(noAttendance, { [gridPath]: () => json(200, grid) });
    renderAt(groupPath);

    await waitFor(() =>
      expect(calls.some((call) => call.url.pathname === '/api/v1/auth/me')).toBe(true),
    );
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(screen.queryByText('جدول الحضور')).not.toBeInTheDocument();
    expect(attendanceCalls()).toHaveLength(0);
  });

  it('stays quiet when the group is forbidden, and shows other errors', async () => {
    api(admin, { [gridPath]: () => problem(403, 'FORBIDDEN') });
    renderAt(groupPath);
    const card = (await screen.findByText('جدول الحضور')).closest('[data-slot="card"]');
    await waitFor(() => expect(attendanceCalls().length).toBeGreaterThan(0));
    await new Promise((resolve) => setTimeout(resolve, 100));
    // The group section above answers its own 404 here; the grid itself says nothing.
    expect(within(card as HTMLElement).queryByRole('alert')).not.toBeInTheDocument();
  });

  it('shows the Arabic message for a server error', async () => {
    api(admin, { [gridPath]: () => problem(500, 'INTERNAL_ERROR') });
    renderAt(groupPath);

    expect(
      await screen.findByText('حصلت مشكلة في السيرفر، جرب تاني', {}, { timeout: 5000 }),
    ).toBeInTheDocument();
  });
});

describe("a student's attendance list", () => {
  const studentPath = '/students/' + studentId;
  const listPath = 'GET ' + studentPath + '/attendance';
  const page = (
    data: StudentAttendanceItem[],
    pageNumber = 1,
    total = data.length,
  ): Page<StudentAttendanceItem> => ({
    data,
    meta: { page: pageNumber, pageSize: 20, total },
  });

  it('lists the sessions as given, newest first, with the marks', async () => {
    api(admin, {
      [listPath]: () =>
        json(
          200,
          page([
            item(sessionTwo, '2026-10-15T14:00:00.000Z', 2, 'absent'),
            item(sessionOne, '2026-10-08T14:00:00.000Z', 1, 'present'),
          ]),
        ),
    });
    renderAt(studentPath);

    expect(await screen.findByText('غايب')).toBeInTheDocument();
    expect(screen.getByText(/الأداء 4 · الواجب مفيش واجب/)).toBeInTheDocument();
    const rows = screen
      .getAllByRole('listitem')
      .filter((row) => row.textContent?.includes('جروب A'));
    expect(rows).toHaveLength(2);
    expect(rows[0]).toHaveTextContent('#2');
    expect(rows[1]).toHaveTextContent('#1');
  });

  it('pages through the history and keeps the page in the URL', async () => {
    api(admin, {
      [listPath]: (url) =>
        url.searchParams.get('page') === '2'
          ? json(200, page([item(sessionOne, '2026-10-08T14:00:00.000Z', 1, 'present')], 2, 21))
          : json(200, page([item(sessionTwo, '2026-10-15T14:00:00.000Z', 2, 'absent')], 1, 21)),
    });
    const router = renderAt(studentPath);

    await userEvent.setup().click(await screen.findByRole('button', { name: /التالي/ }));
    await waitFor(() => expect(router.state.location.search).toBe('?page=2'));
    await waitFor(() => expect(attendanceCalls().at(-1)?.url.searchParams.get('page')).toBe('2'));
    expect(await screen.findByText('حاضر')).toBeInTheDocument();
  });

  it('says nothing is recorded yet', async () => {
    api(admin, { [listPath]: () => json(200, page([])) });
    renderAt(studentPath);

    expect(await screen.findByText('مفيش حضور متسجل')).toBeInTheDocument();
  });

  it('stays hidden, and does not ask, without attendance.read', async () => {
    api(noAttendance, { [listPath]: () => json(200, page([])) });
    renderAt(studentPath);

    await waitFor(() =>
      expect(calls.some((call) => call.url.pathname === '/api/v1/auth/me')).toBe(true),
    );
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(screen.queryByText('مفيش حضور متسجل')).not.toBeInTheDocument();
    expect(attendanceCalls()).toHaveLength(0);
  });

  it('stays quiet when the student is forbidden or missing', async () => {
    api(admin, { [listPath]: () => problem(403, 'FORBIDDEN') });
    renderAt(studentPath);

    await waitFor(() => expect(attendanceCalls().length).toBeGreaterThan(0));
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(screen.queryByText('مفيش حضور متسجل')).not.toBeInTheDocument();
  });
});
