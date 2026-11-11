import type { FinanceReport, Me, OverviewReport, Payment } from '@kidzzy/shared';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest';
import { localToday } from '@/lib/format';
import { AppProviders } from './providers';
import { routes } from './router';

// The reports workspace (US-38), through the real routes with the API mocked at fetch.

const admin: Me = {
  id: 'admin-1',
  name: 'Mohamed',
  email: 'admin@test.local',
  phone: null,
  roles: ['Admin'],
  permissions: [
    'reports.read:any',
    'payments.read:any',
    'students.read:any',
    'instructors.read:any',
  ],
  mustChangePassword: false,
  academy: { id: 'a1', name: 'KidzzyCoders', timezone: 'Africa/Cairo' },
};
const instructorUser: Me = {
  ...admin,
  id: 'ana-id',
  roles: ['Instructor'],
  permissions: ['sessions.read:own', 'payments.read:own'],
};

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
const problem = (status: number, code: string) =>
  json(status, { type: 'about:blank', title: 'Error', status, code });

const overview: OverviewReport = {
  roundIncome: '5400.00',
  roundOutflow: '3000.00',
  roundNet: '2400.00',
  averageRoundWeeks: 2.5,
};

const finance: FinanceReport = {
  period: { from: '2026-11-01', to: '2026-11-30' },
  actual: { in: '4500.00', out: '1500.00', net: '3000.00' },
  expected: {
    in: '2700.00',
    out: '3000.00',
    net: '-300.00',
    skippedStudents: 2,
    skippedInstructorPairs: 1,
  },
  outstanding: {
    students: { count: 3, total: '2700.00' },
    instructors: { count: 1, total: '1500.00' },
  },
};

const payment = (id: string, over: Partial<Payment> = {}): Payment => ({
  id,
  cycleId: `c-${id}`,
  payeeType: 'student',
  payeeId: `st-${id}`,
  payeeName: `Layla ${id}`,
  groupId: null,
  groupName: null,
  cycleNumber: 2,
  amount: '900.00',
  paidOn: '2026-11-10',
  method: 'cash',
  note: null,
  recordedBy: { id: 'admin-1', name: 'Mohamed' },
  createdAt: '2026-11-10T10:00:00.000Z',
  ...over,
});

let fetchMock: MockInstance<typeof fetch>;
let calls: URL[];
let financeResponse: (url: URL) => Response;

function api(me: Me) {
  fetchMock.mockImplementation((input) => {
    const url = new URL(String(input), 'http://localhost');
    const path = url.pathname.replace('/api/v1', '');
    calls.push(url);
    if (path === '/auth/me') return Promise.resolve(json(200, me));
    if (path === '/reports/overview') return Promise.resolve(json(200, overview));
    if (path === '/reports/finance') return Promise.resolve(financeResponse(url));
    if (path === '/payments') {
      const pageSize = Number(url.searchParams.get('pageSize'));
      return Promise.resolve(
        json(200, {
          data: [
            payment('1'),
            payment('2', {
              payeeType: 'instructor',
              payeeId: 'ins-2',
              payeeName: 'Ana',
              groupName: 'Scratch A',
              method: 'transfer',
              amount: '1500.00',
            }),
          ],
          meta: { page: Number(url.searchParams.get('page')), pageSize, total: 2 },
        }),
      );
    }
    return Promise.resolve(problem(404, 'NOT_FOUND'));
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

const callsTo = (path: string) =>
  calls.filter((url) => url.pathname.replace('/api/v1', '') === path);
const search = (router: ReturnType<typeof renderAt>) => router.state.location.search;

beforeEach(() => {
  calls = [];
  financeResponse = () => json(200, finance);
  fetchMock = vi.spyOn(globalThis, 'fetch');
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe('the reports workspace: access and frame', () => {
  it('has its own frame with the sidebar, not the app shell', async () => {
    api(admin);
    renderAt('/reports');

    const sidebar = await screen.findByRole('navigation', { name: 'التقارير' });
    expect(within(sidebar).getByRole('link', { name: 'نظرة عامة' })).toHaveAttribute(
      'href',
      '/reports',
    );
    expect(within(sidebar).getByRole('link', { name: 'الفلوس' })).toHaveAttribute(
      'href',
      '/reports/finance',
    );
    expect(within(sidebar).getByRole('link', { name: 'رجوع للتطبيق' })).toHaveAttribute(
      'href',
      '/',
    );
    // The app shell's navigation is not drawn.
    expect(screen.queryByRole('navigation', { name: 'الأقسام' })).not.toBeInTheDocument();
  });

  it('is forbidden for an instructor, with no report request', async () => {
    api(instructorUser);
    renderAt('/reports/finance');
    expect(await screen.findByText(/مش مسموح/)).toBeInTheDocument();
    expect(callsTo('/reports/finance')).toHaveLength(0);
    expect(callsTo('/reports/overview')).toHaveLength(0);
  });

  it('sends a signed-out user to the login page, not to forbidden', async () => {
    // Everything is 401, the refresh included: the user is signed out.
    fetchMock.mockImplementation(() => Promise.resolve(problem(401, 'UNAUTHENTICATED')));
    const router = renderAt('/reports');
    await waitFor(() => expect(router.state.location.pathname).toBe('/login'));
  });

  it('adds the reports link to the app navigation only for reports.read', async () => {
    api(admin);
    const first = renderAt('/');
    expect(await screen.findByRole('link', { name: 'التقارير' })).toHaveAttribute(
      'href',
      '/reports',
    );
    first.dispose();
  });

  it('does not show the reports link to an instructor', async () => {
    api(instructorUser);
    renderAt('/');
    await screen.findByRole('navigation', { name: 'الأقسام' });
    expect(screen.queryByRole('link', { name: 'التقارير' })).not.toBeInTheDocument();
  });

  it('collapses the sidebar behind a menu button on a phone', async () => {
    api(admin);
    renderAt('/reports');
    const button = await screen.findByRole('button', { name: 'افتح القايمة' });
    const sidebar = document.getElementById('reports-sidebar');
    expect(button).toHaveAttribute('aria-expanded', 'false');
    expect(sidebar).toHaveClass('hidden');

    await userEvent.click(button);
    expect(screen.getByRole('button', { name: 'اقفل القايمة' })).toHaveAttribute(
      'aria-expanded',
      'true',
    );
    expect(sidebar).toHaveClass('block');
  });
});

describe('the overview', () => {
  it('shows the round income, outflow, net and the average length', async () => {
    api(admin);
    renderAt('/reports');
    const card = async (label: string) =>
      (await screen.findByText(label)).parentElement?.textContent ?? '';
    expect(await card('دخل الدورة')).toContain('5,400.00');
    expect(await card('مصروفات الدورة')).toContain('3,000.00');
    expect(await card('صافي الدورة')).toContain('2,400.00');
    expect(await card('متوسط طول الدورة')).toContain('2.5 أسبوع');
  });

  it('says there is nothing to average when the average is null', async () => {
    fetchMock.mockImplementation((input) => {
      const path = new URL(String(input), 'http://localhost').pathname.replace('/api/v1', '');
      if (path === '/auth/me') return Promise.resolve(json(200, admin));
      return Promise.resolve(json(200, { ...overview, averageRoundWeeks: null }));
    });
    renderAt('/reports');
    const label = await screen.findByText('متوسط طول الدورة');
    expect(label.parentElement?.textContent).toContain('—');
  });
});

describe('the period filter', () => {
  it('defaults to this month: no params in the URL, and the API gets the whole month', async () => {
    api(admin);
    const router = renderAt('/reports/finance');
    await screen.findByText('دخل متوقع');
    expect(search(router)).toBe('');
    const today = localToday('Africa/Cairo');
    const [year, month] = today.split('-');
    const request = callsTo('/reports/finance')[0]!;
    expect(request.searchParams.get('from')).toBe(`${year}-${month}-01`);
    expect(request.searchParams.get('to')).toMatch(new RegExp(`^${year}-${month}-\\d\\d$`));
  });

  it('is kept in the URL and in the sidebar links while moving between pages', async () => {
    api(admin);
    const router = renderAt('/reports?from=2026-11-02&to=2026-11-09');
    const sidebar = await screen.findByRole('navigation', { name: 'التقارير' });
    expect(within(sidebar).getByRole('link', { name: 'الفلوس' })).toHaveAttribute(
      'href',
      '/reports/finance?from=2026-11-02&to=2026-11-09',
    );

    await userEvent.click(within(sidebar).getByRole('link', { name: 'الفلوس' }));
    await screen.findByText('دخل متوقع');
    expect(router.state.location.pathname).toBe('/reports/finance');
    expect(search(router)).toBe('?from=2026-11-02&to=2026-11-09');
    const request = callsTo('/reports/finance').at(-1)!;
    expect(request.searchParams.get('from')).toBe('2026-11-02');
    expect(request.searchParams.get('to')).toBe('2026-11-09');

    await userEvent.click(within(sidebar).getByRole('link', { name: 'نظرة عامة' }));
    expect(router.state.location.pathname).toBe('/reports');
    expect(search(router)).toBe('?from=2026-11-02&to=2026-11-09');
  });

  it('sets today, last month and this month from the preset buttons', async () => {
    api(admin);
    const router = renderAt('/reports/finance?from=2026-11-02&to=2026-11-09');
    await screen.findByText('دخل متوقع');

    await userEvent.click(screen.getByRole('radio', { name: 'النهارده' }));
    const today = localToday('Africa/Cairo');
    expect(search(router)).toBe(`?from=${today}&to=${today}`);

    await userEvent.click(screen.getByRole('radio', { name: 'الشهر اللي فات' }));
    expect(search(router)).toMatch(/^\?from=\d{4}-\d\d-01&to=\d{4}-\d\d-\d\d$/);

    // This month is the default, so it clears the params.
    await userEvent.click(screen.getByRole('radio', { name: 'الشهر ده' }));
    expect(search(router)).toBe('');
  });

  it('edits the range with from and to dates', async () => {
    api(admin);
    const router = renderAt('/reports/finance?from=2026-11-02&to=2026-11-09');
    await screen.findByText('دخل متوقع');
    await userEvent.click(screen.getByRole('radio', { name: 'من / إلى' }));

    fireEvent.change(screen.getByLabelText('من'), { target: { value: '2026-10-01' } });
    expect(search(router)).toBe('?from=2026-10-01&to=2026-11-09');
  });

  it('says a range that ends before it starts, and does not ask the API', async () => {
    api(admin);
    renderAt('/reports/finance?from=2026-11-10&to=2026-11-09');
    expect(await screen.findByText('تاريخ البداية بعد تاريخ النهاية')).toBeInTheDocument();
    expect(callsTo('/reports/finance')).toHaveLength(0);
    expect(callsTo('/payments')).toHaveLength(0);
  });

  it('shows the Arabic message when the API refuses a period that is too long', async () => {
    financeResponse = () => problem(422, 'REPORT_PERIOD_TOO_LONG');
    api(admin);
    renderAt('/reports/finance?from=2025-01-01&to=2026-11-09');
    expect(await screen.findByText('الفترة طويلة. اختار فترة أقصاها 366 يوم')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'جرب تاني' })).toBeInTheDocument();
  });
});

describe('the finance report', () => {
  it('shows actual, expected with its note, and outstanding', async () => {
    api(admin);
    renderAt('/reports/finance');
    const value = async (label: string) =>
      (await screen.findByText(label)).parentElement?.textContent ?? '';

    expect(await value('دخل')).toContain('4,500.00');
    expect(await value('مصروفات')).toContain('1,500.00');
    expect(await value('الصافي')).toContain('3,000.00');
    expect(await value('دخل متوقع')).toContain('2,700.00');
    expect(await value('الصافي المتوقع')).toContain('300.00'); // negative: -300.00
    expect(
      screen.getByText('التوقع بيفترض إن مفيش طالب هيدخل أو يخرج ومفيش حصص تانية هتتلغي.'),
    ).toBeInTheDocument();
    expect(screen.getByText(/اتستبعد 2 طالب و1 مدرس وجروب/)).toBeInTheDocument();
    const students = await value('طلبة');
    expect(students).toContain('2,700.00');
    expect(students).toContain('3 دورة');
    expect(await value('مدرسين')).toContain('1,500.00');
  });

  it('lists the payments of the period with a link to each payee', async () => {
    api(admin);
    renderAt('/reports/finance?from=2026-11-02&to=2026-11-09');
    const table = await screen.findByRole('table');
    expect(within(table).getByRole('link', { name: 'Layla 1' })).toHaveAttribute(
      'href',
      '/students/st-1',
    );
    expect(within(table).getByRole('link', { name: 'Ana' })).toHaveAttribute(
      'href',
      '/instructors/ins-2',
    );
    expect(within(table).getByText('تحويل')).toBeInTheDocument();
    const request = callsTo('/payments')[0]!;
    expect(request.searchParams.get('from')).toBe('2026-11-02');
    expect(request.searchParams.get('to')).toBe('2026-11-09');
  });

  it('filters the payments by payee type and by method, kept in the URL', async () => {
    api(admin);
    const router = renderAt('/reports/finance');
    await screen.findByRole('table');

    await userEvent.selectOptions(screen.getByLabelText('المدفوع له'), 'instructor');
    await userEvent.selectOptions(screen.getByLabelText('طريقة الدفع'), 'transfer');
    expect(search(router)).toBe('?payeeType=instructor&method=transfer');
    await waitFor(() => {
      const request = callsTo('/payments').at(-1)!;
      expect(request.searchParams.get('payeeType')).toBe('instructor');
      expect(request.searchParams.get('method')).toBe('transfer');
    });

    await userEvent.selectOptions(screen.getByLabelText('طريقة الدفع'), '');
    expect(search(router)).toBe('?payeeType=instructor');
  });

  it('shows 50 rows per page by default, with 25 and 100 as choices', async () => {
    api(admin);
    const router = renderAt('/reports/finance');
    await screen.findByRole('table');
    expect(callsTo('/payments')[0]!.searchParams.get('pageSize')).toBe('50');
    expect(screen.getByLabelText('عدد الصفوف في الصفحة')).toHaveValue('50');
    expect(
      within(screen.getByLabelText('عدد الصفوف في الصفحة'))
        .getAllByRole('option')
        .map((option) => option.textContent),
    ).toEqual(['25', '50', '100']);
    expect(search(router)).toBe('');

    await userEvent.selectOptions(screen.getByLabelText('عدد الصفوف في الصفحة'), '25');
    expect(search(router)).toBe('?pageSize=25');
    await waitFor(() =>
      expect(callsTo('/payments').at(-1)!.searchParams.get('pageSize')).toBe('25'),
    );

    await userEvent.selectOptions(screen.getByLabelText('عدد الصفوف في الصفحة'), '100');
    expect(search(router)).toBe('?pageSize=100');
    await waitFor(() =>
      expect(callsTo('/payments').at(-1)!.searchParams.get('pageSize')).toBe('100'),
    );

    await userEvent.selectOptions(screen.getByLabelText('عدد الصفوف في الصفحة'), '50');
    expect(search(router)).toBe('');
  });
});
