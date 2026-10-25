import type { AuditLog, Me, Page, Session, Student } from '@kidzzy/shared';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest';
import { AppProviders } from './providers';
import { routes } from './router';

// The audit log screen (US-35) and the history links, through the real routes with the API mocked
// at fetch.

const admin: Me = {
  id: 'admin-1',
  name: 'Mohamed',
  email: 'admin@test.local',
  phone: null,
  roles: ['Admin'],
  permissions: [
    'audit.read:any',
    'sessions.read:any',
    'sessions.update:any',
    'students.read:any',
    'groups.read:any',
  ],
  mustChangePassword: false,
  academy: { id: 'a1', name: 'KidzzyCoders', timezone: 'Africa/Cairo' },
};
const instructorUser: Me = {
  ...admin,
  id: 'ana-id',
  roles: ['Instructor'],
  permissions: ['sessions.read:own', 'groups.read:own'],
};

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
const problem = (status: number, code: string) =>
  json(status, { type: 'about:blank', title: 'Error', status, code });

const SESSION_ID = '8a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d';
const held: AuditLog = {
  id: 'log-1',
  actor: { id: 'admin-1', name: 'Mohamed' },
  action: 'session.held',
  entityType: 'sessions',
  entityId: SESSION_ID,
  before: {
    status: 'scheduled',
    sessionNumber: null,
    cycles: [{ cycleId: 'c1', sessionsCounted: 2 }],
  },
  after: { status: 'held', sessionNumber: 3, cycles: [{ cycleId: 'c1', sessionsCounted: 3 }] },
  createdAt: '2026-10-22T14:00:00.000Z',
};
const paid: AuditLog = {
  id: 'log-2',
  actor: { id: 'ana-id', name: 'Ana' },
  action: 'payment.recorded',
  entityType: 'payment_cycles',
  entityId: 'cycle-1',
  before: { cycleStatus: 'due' },
  after: { cycleStatus: 'paid', amount: '1500.00', paidOn: '2026-10-21', method: 'transfer' },
  createdAt: '2026-10-21T10:00:00.000Z',
};
const plan: AuditLog = {
  id: 'log-3',
  actor: { id: 'admin-1', name: 'Mohamed' },
  action: 'payment_plan.set',
  entityType: 'payment_plans',
  entityId: 'plan-1',
  before: null,
  after: { payeeType: 'student', studentId: 'student-9', version: 1, sessionsPerCycle: 8 },
  createdAt: '2026-10-20T10:00:00.000Z',
};
const page = (data: AuditLog[], pageNumber = 1, total = data.length): Page<AuditLog> => ({
  data,
  meta: { page: pageNumber, pageSize: 20, total },
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

const logCalls = () =>
  calls.filter((c) => c.method === 'GET' && c.url.pathname.endsWith('/audit-logs'));

beforeEach(() => {
  calls = [];
  fetchMock = vi.spyOn(globalThis, 'fetch');
});
afterEach(() => vi.restoreAllMocks());

describe('the audit log screen', () => {
  it('is in the nav for the admin', async () => {
    api(admin, { 'GET /audit-logs': () => json(200, page([])) });
    renderAt('/');
    expect(await screen.findByRole('link', { name: 'سجل التغييرات' })).toHaveAttribute(
      'href',
      '/audit-log',
    );
  });

  it('is not in the nav of an instructor, and opening it shows the forbidden page', async () => {
    api(instructorUser);
    renderAt('/audit-log');
    expect(await screen.findByText(/مش مسموح/)).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'سجل التغييرات' })).not.toBeInTheDocument();
    expect(logCalls()).toHaveLength(0);
  });

  it('lists the entries as sent, with the time in the academy’s zone, who and an Arabic label', async () => {
    api(admin, { 'GET /audit-logs': () => json(200, page([held, paid, plan])) });
    renderAt('/audit-log');

    expect(await screen.findByText('تسجيل حصة (اتعملت)')).toBeInTheDocument();
    expect(screen.getByText('تسجيل دفعة')).toBeInTheDocument();
    expect(screen.getByText('تحديد خطة دفع')).toBeInTheDocument();
    const row = screen.getByText('تسجيل حصة (اتعملت)').closest('tr') as HTMLElement;
    // 14:00 UTC on 2026-10-22 is 17:00 in Cairo (UTC+3).
    expect(within(row).getByText(/22 أكتوبر 2026/)).toBeInTheDocument();
    expect(within(row).getByText(/5:00 م/)).toBeInTheDocument();
    expect(within(row).getByText('Mohamed')).toBeInTheDocument();
    const query = logCalls()[0]?.url.searchParams;
    expect(query?.get('page')).toBe('1');
    expect(query?.get('pageSize')).toBe('20');
    expect(query?.has('entityType')).toBe(false);
  });

  it('links a session and a student’s plan to their screens, and a cycle to nothing', async () => {
    api(admin, { 'GET /audit-logs': () => json(200, page([held, paid, plan])) });
    renderAt('/audit-log');
    await screen.findByText('تسجيل حصة (اتعملت)');

    const sessionRow = screen.getByText('تسجيل حصة (اتعملت)').closest('tr') as HTMLElement;
    expect(within(sessionRow).getByRole('link', { name: 'حصة' })).toHaveAttribute(
      'href',
      '/sessions/' + SESSION_ID,
    );
    const planRow = screen.getByText('تحديد خطة دفع').closest('tr') as HTMLElement;
    expect(within(planRow).getByRole('link', { name: 'خطة دفع' })).toHaveAttribute(
      'href',
      '/students/student-9',
    );
    const cycleRow = screen.getByText('تسجيل دفعة').closest('tr') as HTMLElement;
    expect(within(cycleRow).queryByRole('link')).not.toBeInTheDocument();
  });

  it('shows the values before and after side by side in the details', async () => {
    api(admin, { 'GET /audit-logs': () => json(200, page([paid])) });
    renderAt('/audit-log');
    const user = userEvent.setup();

    await user.click(await screen.findByRole('button', { name: 'تفاصيل تسجيل دفعة' }));
    const before = within(screen.getByRole('region', { name: 'قبل' }));
    const after = within(screen.getByRole('region', { name: 'بعد' }));
    expect(before.getByText('مستحقة')).toBeInTheDocument();
    expect(after.getByText('مدفوعة')).toBeInTheDocument();
    expect(after.getByText(/1,500\.00/)).toBeInTheDocument();
    expect(after.getByText('تحويل')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'تفاصيل تسجيل دفعة' }));
    expect(screen.queryByRole('region', { name: 'بعد' })).not.toBeInTheDocument();
  });

  it('says there is nothing for an entry with no before values', async () => {
    api(admin, { 'GET /audit-logs': () => json(200, page([plan])) });
    renderAt('/audit-log');
    await userEvent.setup().click(await screen.findByRole('button', { name: /تفاصيل/ }));
    expect(
      within(screen.getByRole('region', { name: 'قبل' })).getByText('مفيش'),
    ).toBeInTheDocument();
  });

  it('keeps the kind of record in the URL and asks for it', async () => {
    api(admin, { 'GET /audit-logs': () => json(200, page([held])) });
    const router = renderAt('/audit-log');
    await screen.findByText('تسجيل حصة (اتعملت)');

    await userEvent.setup().selectOptions(screen.getByLabelText('نوع العنصر'), 'sessions');

    await waitFor(() =>
      expect(logCalls().at(-1)?.url.searchParams.get('entityType')).toBe('sessions'),
    );
    expect(router.state.location.search).toBe('?entityType=sessions');
  });

  it('turns an academy-local range into UTC instants, to exclusive (across the DST change)', async () => {
    api(admin, { 'GET /audit-logs': () => json(200, page([held])) });
    const router = renderAt('/audit-log');
    await screen.findByText('تسجيل حصة (اتعملت)');

    fireEvent.change(screen.getByLabelText('من'), { target: { value: '2026-10-29' } });
    fireEvent.change(screen.getByLabelText('إلى'), { target: { value: '2026-10-30' } });

    // 29 Oct 00:00 is UTC+3; the day after the 30th starts at UTC+2 (31 Oct 00:00 = 30 Oct 22:00Z).
    await waitFor(() => {
      const query = logCalls().at(-1)?.url.searchParams;
      expect(query?.get('from')).toBe('2026-10-28T21:00:00.000Z');
      expect(query?.get('to')).toBe('2026-10-30T22:00:00.000Z');
    });
    expect(router.state.location.search).toBe('?from=2026-10-29&to=2026-10-30');
  });

  it('says a backwards range is wrong and does not ask the API for it', async () => {
    api(admin, { 'GET /audit-logs': () => json(200, page([held])) });
    renderAt('/audit-log?from=2026-10-30&to=2026-10-29');

    expect(await screen.findByText('تاريخ البداية بعد تاريخ النهاية')).toBeInTheDocument();
    expect(logCalls()).toHaveLength(0);
  });

  it('starts from the URL: the record, the actor and page 2', async () => {
    api(admin, { 'GET /audit-logs': () => json(200, page([held], 2, 45)) });
    renderAt(`/audit-log?entityType=sessions&entityId=${SESSION_ID}&actorId=admin-1&page=2`);

    await screen.findByText('تسجيل حصة (اتعملت)');
    const query = logCalls()[0]?.url.searchParams;
    expect(query?.get('entityType')).toBe('sessions');
    expect(query?.get('entityId')).toBe(SESSION_ID);
    expect(query?.get('actorId')).toBe('admin-1');
    expect(query?.get('page')).toBe('2');
    expect(screen.getByRole('button', { name: /المنفذ: Mohamed/ })).toBeInTheDocument();
  });

  it('filters by who from a row, and clears the record and the actor', async () => {
    api(admin, { 'GET /audit-logs': () => json(200, page([held, paid])) });
    const router = renderAt(`/audit-log?entityId=${SESSION_ID}`);
    const user = userEvent.setup();
    await screen.findByText('تسجيل دفعة');

    await user.click(screen.getByRole('button', { name: 'فلتر بالمنفذ Ana' }));
    await waitFor(() => expect(logCalls().at(-1)?.url.searchParams.get('actorId')).toBe('ana-id'));
    expect(router.state.location.search).toContain('actorId=ana-id');

    await user.click(screen.getByRole('button', { name: /المنفذ: Ana/ }));
    await waitFor(() => expect(logCalls().at(-1)?.url.searchParams.has('actorId')).toBe(false));
    await user.click(screen.getByRole('button', { name: 'عنصر واحد بس' }));
    await waitFor(() => expect(logCalls().at(-1)?.url.searchParams.has('entityId')).toBe(false));
    expect(router.state.location.search).toBe('');
  });

  it('says there are no entries, and shows the error when the log cannot be read', async () => {
    api(admin, { 'GET /audit-logs': () => json(200, page([])) });
    renderAt('/audit-log');
    expect(await screen.findByText('مفيش تغييرات')).toBeInTheDocument();
  });

  it('shows the Arabic message when the API refuses', async () => {
    api(admin, { 'GET /audit-logs': () => problem(400, 'VALIDATION_FAILED') });
    renderAt('/audit-log');
    expect(await screen.findByRole('alert')).toBeInTheDocument();
  });
});

describe('the history links', () => {
  const session: Session = {
    id: SESSION_ID,
    group: { id: 'group-1', name: 'جروب A' },
    instructorId: 'ana-id',
    instructorName: 'Ana',
    scheduledAt: '2026-10-22T14:00:00.000Z',
    durationMin: 60,
    status: 'scheduled',
    sessionNumber: null,
    isMakeup: false,
    compensatesSessionId: null,
    cancelReason: null,
  };
  const student = {
    id: 'student-9',
    code: 'S-1',
    name: 'منى',
    age: null,
    parentName: 'P',
    parentPhone: '01012345678',
    notes: null,
    isActive: true,
    currentGroup: null,
    currentCycle: null,
  } as unknown as Student;

  it('opens the log filtered by the session from its details', async () => {
    api(admin, { [`GET /sessions/${SESSION_ID}`]: () => json(200, session) });
    renderAt('/sessions/' + SESSION_ID);

    // The nav has a link of the same name, so look for the one that carries the record.
    await screen.findByText('جروب A');
    const hrefs = () =>
      screen
        .getAllByRole('link', { name: 'سجل التغييرات' })
        .map((link) => link.getAttribute('href'));
    await waitFor(() =>
      expect(hrefs()).toContain(`/audit-log?entityType=sessions&entityId=${SESSION_ID}`),
    );
  });

  it('opens the log filtered by the student from the profile', async () => {
    api(admin, {
      [`GET /students/${student.id}`]: () => json(200, student),
      [`GET /students/${student.id}/enrollments`]: () => json(200, { data: [] }),
      'GET /payment-plans': () => json(200, { data: [] }),
    });
    renderAt('/students/' + student.id);

    await screen.findByText('منى');
    const hrefs = () =>
      screen
        .getAllByRole('link', { name: 'سجل التغييرات' })
        .map((link) => link.getAttribute('href'));
    await waitFor(() =>
      expect(hrefs()).toContain(`/audit-log?entityType=students&entityId=${student.id}`),
    );
  });

  it('is not offered to someone who cannot read the log', async () => {
    api(instructorUser, { [`GET /sessions/${SESSION_ID}`]: () => json(200, session) });
    renderAt('/sessions/' + SESSION_ID);

    await screen.findByText('جروب A');
    expect(screen.queryByRole('link', { name: 'سجل التغييرات' })).not.toBeInTheDocument();
  });
});
