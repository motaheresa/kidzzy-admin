import type { Me, Page, Payment, PaymentCycle } from '@kidzzy/shared';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest';
import { AppProviders } from './providers';
import { routes } from './router';

// The Payments screen (US-24) and an instructor's payments next to their cycles (US-25), through
// the real routes with the API mocked at fetch.

const admin: Me = {
  id: 'admin-1',
  name: 'Mohamed',
  email: 'admin@test.local',
  phone: null,
  roles: ['Admin'],
  permissions: [
    'payments.read:any',
    'payments.manage:any',
    'students.read:any',
    'instructors.read:any',
    'groups.read:any',
  ],
  mustChangePassword: false,
  academy: { id: 'a1', name: 'KidzzyCoders', timezone: 'Africa/Cairo' },
};
const instructorUser: Me = {
  ...admin,
  id: 'ana-id',
  roles: ['Instructor'],
  permissions: ['payments.read:own', 'groups.read:own'],
};

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
const problem = (status: number, code: string) =>
  json(status, { type: 'about:blank', title: 'Error', status, code });

const cycle = (id: string, over: Partial<PaymentCycle> = {}): PaymentCycle => ({
  id,
  payeeType: 'student',
  payeeId: 'student-' + id,
  payeeName: 'طالب ' + id,
  groupId: null,
  groupName: null,
  cycleNumber: 1,
  sessionsPerCycle: 4,
  amount: '900.00',
  openingCount: 0,
  sessionsCounted: 4,
  status: 'due',
  dueAt: '2026-10-20T10:00:00.000Z',
  paidAt: null,
  ...over,
});
const instructorCycle = (id: string, over: Partial<PaymentCycle> = {}) =>
  cycle(id, {
    payeeType: 'instructor',
    payeeId: 'inst-' + id,
    payeeName: 'مدرس ' + id,
    groupId: 'g-' + id,
    groupName: 'جروب ' + id,
    amount: '1500.00',
    ...over,
  });
const payment = (id: string, over: Partial<Payment> = {}): Payment => ({
  id,
  cycleId: 'cycle-' + id,
  payeeType: 'instructor',
  payeeId: 'inst-' + id,
  payeeName: 'مدرس ' + id,
  groupId: 'g-' + id,
  groupName: 'جروب ' + id,
  cycleNumber: 1,
  amount: '1500.00',
  paidOn: '2026-10-20',
  method: 'transfer',
  note: null,
  recordedBy: { id: 'admin-1', name: 'Mohamed' },
  createdAt: '2026-10-20T10:00:00.000Z',
  ...over,
});
const page = <T,>(data: T[], pageNumber = 1, total = data.length): Page<T> => ({
  data,
  meta: { page: pageNumber, pageSize: 20, total },
});

type Handler = (url: URL) => Response;
let fetchMock: MockInstance<typeof fetch>;
let calls: { method: string; url: URL; body: unknown }[];

function api(me: Me, handlers: Record<string, Handler> = {}) {
  fetchMock.mockImplementation((input, init = {}) => {
    const url = new URL(String(input), 'http://localhost');
    const method = init.method ?? 'GET';
    const path = url.pathname.replace('/api/v1', '');
    calls.push({ method, url, body: init.body ? JSON.parse(String(init.body)) : undefined });
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

const cycleCalls = () =>
  calls.filter((c) => c.method === 'GET' && c.url.pathname.endsWith('/payment-cycles'));
const paymentCalls = () =>
  calls.filter((c) => c.method === 'GET' && c.url.pathname.endsWith('/payments'));

beforeEach(() => {
  calls = [];
  fetchMock = vi.spyOn(globalThis, 'fetch');
});
afterEach(() => vi.restoreAllMocks());

describe('the Payments screen', () => {
  it('is in the nav for the admin', async () => {
    api(admin);
    renderAt('/');
    expect(await screen.findByRole('link', { name: 'المدفوعات' })).toHaveAttribute(
      'href',
      '/payments',
    );
  });

  it('is not in the nav of an instructor, and opening it shows the forbidden page', async () => {
    api(instructorUser, { 'GET /payment-cycles': () => json(200, page([])) });
    renderAt('/payments');

    expect(
      await screen.findByRole('heading', { name: 'مش مسموح لك تفتح الصفحة دي' }),
    ).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'المدفوعات' })).not.toBeInTheDocument();
  });

  it('opens on the students’ Due cycles, with the action to record each payment', async () => {
    api(admin, {
      'GET /payment-cycles': () =>
        json(
          200,
          page([
            cycle('1', { payeeName: 'منى' }),
            cycle('2', { payeeName: 'سلمى', amount: '700.50' }),
          ]),
        ),
    });
    renderAt('/payments');

    const table = await screen.findByRole('table');
    const rows = within(table).getAllByRole('row');
    expect(rows).toHaveLength(3);
    expect(within(rows[1]!).getByRole('link', { name: 'منى' })).toHaveAttribute(
      'href',
      '/students/student-1',
    );
    expect(within(rows[1]!).getByText('4 من 4')).toBeInTheDocument();
    expect(within(rows[1]!).getByText('مستحقة')).toBeInTheDocument();
    expect(within(rows[1]!).getByRole('button', { name: /سجّل دفعة/ })).toBeInTheDocument();

    const first = cycleCalls()[0]?.url.searchParams;
    expect(first?.get('payeeType')).toBe('student');
    expect(first?.get('status')).toBe('due');
    expect(first?.get('page')).toBe('1');
  });

  it('keeps the filter and the tab in the URL and asks for them', async () => {
    api(admin, { 'GET /payment-cycles': () => json(200, page([])) });
    const router = renderAt('/payments');
    const user = userEvent.setup();

    await user.click(await screen.findByRole('radio', { name: 'قربت تخلص' }));
    await waitFor(() => expect(router.state.location.search).toBe('?status=approaching'));
    await waitFor(() =>
      expect(cycleCalls().at(-1)?.url.searchParams.get('status')).toBe('approaching'),
    );

    await user.click(screen.getByRole('radio', { name: 'المدرسين' }));
    await waitFor(() => expect(router.state.location.search).toContain('tab=instructors'));
    await waitFor(() =>
      expect(cycleCalls().at(-1)?.url.searchParams.get('payeeType')).toBe('instructor'),
    );

    await user.click(screen.getByRole('radio', { name: 'مستحقة' }));
    await waitFor(() => expect(router.state.location.search).toBe('?tab=instructors'));
  });

  it('starts from the URL: the instructors’ tab, in progress, page 2', async () => {
    api(admin, {
      'GET /payment-cycles': () =>
        json(
          200,
          page([instructorCycle('1', { status: 'in_progress', sessionsCounted: 2 })], 2, 45),
        ),
    });
    renderAt('/payments?tab=instructors&status=in_progress&page=2');

    await screen.findByRole('table');
    const query = cycleCalls()[0]?.url.searchParams;
    expect(query?.get('payeeType')).toBe('instructor');
    expect(query?.get('status')).toBe('in_progress');
    expect(query?.get('page')).toBe('2');
    expect(screen.getByRole('radio', { name: 'المدرسين' })).toBeChecked();
    expect(screen.getByRole('radio', { name: 'شغالة' })).toBeChecked();
  });

  it('shows an instructor’s group on its own column, and pages through the list', async () => {
    api(admin, {
      'GET /payment-cycles': (url) =>
        json(
          200,
          page(
            [instructorCycle(url.searchParams.get('page') === '2' ? '9' : '1')],
            Number(url.searchParams.get('page')),
            45,
          ),
        ),
    });
    const router = renderAt('/payments?tab=instructors');
    const user = userEvent.setup();

    expect(await screen.findByText('جروب 1')).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'الجروب' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /التالي/ }));
    await waitFor(() => expect(router.state.location.search).toContain('page=2'));
    expect(await screen.findByText('جروب 9')).toBeInTheDocument();
  });

  it('says there is nothing Due', async () => {
    api(admin, { 'GET /payment-cycles': () => json(200, page([])) });
    renderAt('/payments');

    expect(await screen.findByText('مفيش دورات مستحقة دلوقتي')).toBeInTheDocument();
  });

  it('records a payment from the Due list and reads the list again', async () => {
    let settled = false;
    api(admin, {
      'GET /payment-cycles': () =>
        json(200, page(settled ? [] : [cycle('1', { payeeName: 'منى' })])),
      'POST /payment-cycles/1/payments': () => {
        settled = true;
        return json(201, payment('1'));
      },
    });
    renderAt('/payments');
    const user = userEvent.setup();

    await user.click(await screen.findByRole('button', { name: /سجّل دفعة/ }));
    await user.click(
      within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'سجّل الدفعة' }),
    );

    await waitFor(() => expect(calls.some((c) => c.method === 'POST')).toBe(true));
    expect(calls.find((c) => c.method === 'POST')?.body).toMatchObject({
      amount: '900.00',
      method: 'cash',
    });
    expect(await screen.findByText('مفيش دورات مستحقة دلوقتي')).toBeInTheDocument();
  });
});

describe('the payment history tab', () => {
  it('lists the payments with who, the group of an instructor, the method and who recorded', async () => {
    api(admin, {
      'GET /payments': () =>
        json(
          200,
          page([
            payment('1'),
            payment('2', {
              payeeType: 'student',
              payeeName: 'منى',
              payeeId: 'student-2',
              groupId: null,
              groupName: null,
              method: 'cash',
              amount: '900.00',
            }),
          ]),
        ),
    });
    renderAt('/payments?tab=history');

    const table = await screen.findByRole('table');
    const rows = within(table).getAllByRole('row');
    expect(rows).toHaveLength(3);
    expect(within(rows[1]!).getByText('جروب 1')).toBeInTheDocument();
    expect(within(rows[1]!).getByText('تحويل')).toBeInTheDocument();
    expect(within(rows[1]!).getByText('Mohamed')).toBeInTheDocument();
    expect(within(rows[2]!).getByRole('link', { name: 'منى' })).toHaveAttribute(
      'href',
      '/students/student-2',
    );
    expect(within(rows[2]!).getByText('—')).toBeInTheDocument();
  });

  it('keeps the date range in the URL and sends it', async () => {
    api(admin, { 'GET /payments': () => json(200, page([])) });
    const router = renderAt('/payments?tab=history');
    await screen.findByText('مفيش مدفوعات');

    fireEvent.change(screen.getByLabelText('من'), { target: { value: '2026-10-01' } });
    fireEvent.change(screen.getByLabelText('إلى'), { target: { value: '2026-10-31' } });

    await waitFor(() => expect(router.state.location.search).toContain('from=2026-10-01'));
    await waitFor(() => {
      const last = paymentCalls().at(-1)?.url.searchParams;
      expect(last?.get('from')).toBe('2026-10-01');
      expect(last?.get('to')).toBe('2026-10-31');
    });
    await userEvent.setup().click(screen.getByRole('button', { name: 'امسح الفلتر' }));
    await waitFor(() => expect(router.state.location.search).toBe('?tab=history'));
  });

  it('says a backwards range is wrong and does not ask the API', async () => {
    api(admin, { 'GET /payments': () => json(200, page([])) });
    renderAt('/payments?tab=history&from=2026-10-20&to=2026-10-05');

    expect(await screen.findByText('تاريخ البداية بعد تاريخ النهاية')).toBeInTheDocument();
    expect(paymentCalls()).toHaveLength(0);
  });

  it('says there are no payments in the range', async () => {
    api(admin, { 'GET /payments': () => json(200, page([])) });
    renderAt('/payments?tab=history&from=2026-10-05');

    expect(await screen.findByText('مفيش مدفوعات')).toBeInTheDocument();
    expect(screen.getByText('جرب فترة تانية.')).toBeInTheDocument();
  });
});

describe('an instructor’s payments next to their cycles (US-25)', () => {
  it('shows an instructor their own past payments with the group, asking without an instructorId', async () => {
    api(instructorUser, {
      'GET /payment-cycles': () =>
        json(200, page([instructorCycle('1', { status: 'in_progress', sessionsCounted: 1 })])),
      'GET /payments': () => json(200, page([payment('1', { groupName: 'جروب القديم' })])),
    });
    renderAt('/');

    expect(await screen.findByText('المدفوعات السابقة')).toBeInTheDocument();
    expect(screen.getByText('جروب القديم')).toBeInTheDocument();
    expect(screen.getByText(/تحويل/)).toBeInTheDocument();
    expect(paymentCalls()[0]?.url.searchParams.has('instructorId')).toBe(false);
  });

  it('shows nothing about payments until there is one', async () => {
    api(instructorUser, {
      'GET /payment-cycles': () =>
        json(200, page([instructorCycle('1', { status: 'in_progress' })])),
      'GET /payments': () => json(200, page([])),
    });
    renderAt('/');

    await screen.findByText('دوراتي');
    await waitFor(() => expect(paymentCalls().length).toBeGreaterThan(0));
    expect(screen.queryByText('المدفوعات السابقة')).not.toBeInTheDocument();
  });

  it('shows the admin an instructor’s payments on their page, asking by instructorId', async () => {
    api(admin, {
      'GET /instructors/inst-1': () =>
        json(200, {
          id: 'inst-1',
          name: 'Ana',
          email: 'ana@test.local',
          phone: null,
          isActive: true,
          createdAt: '2026-10-16T08:30:00.000Z',
          groups: [],
        }),
      'GET /payment-plans': () => json(200, { data: [] }),
      'GET /payment-cycles': () => json(200, page([])),
      'GET /payments': () => json(200, page([payment('1')])),
    });
    renderAt('/instructors/inst-1');

    expect(await screen.findByText('المدفوعات السابقة')).toBeInTheDocument();
    expect(paymentCalls()[0]?.url.searchParams.get('instructorId')).toBe('inst-1');
  });
});

describe('the starting point on the Payments screen (US-36)', () => {
  it('offers the edit on a first cycle in progress only', async () => {
    api(admin, {
      'GET /payment-cycles': () =>
        json(
          200,
          page([
            cycle('a', { status: 'in_progress', sessionsCounted: 1 }),
            cycle('b', { status: 'in_progress', cycleNumber: 2, sessionsCounted: 1 }),
            cycle('c', { status: 'due' }),
          ]),
        ),
    });
    renderAt('/payments?status=in_progress');

    await screen.findByText('طالب a');
    expect(screen.getAllByRole('button', { name: /عدّل نقطة البداية/ })).toHaveLength(1);
  });
});
