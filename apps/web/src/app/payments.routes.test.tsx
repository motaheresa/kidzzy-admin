import type {
  Group,
  InstructorDetail,
  Me,
  PaymentCycle,
  PaymentPlan,
  Student,
} from '@kidzzy/shared';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest';
import { AppProviders } from './providers';
import { routes } from './router';

// A student's plan versions and changing the plan (US-20) through the real routes, with the API
// mocked at fetch.

const admin: Me = {
  id: 'admin-1',
  name: 'Mohamed',
  email: 'admin@test.local',
  phone: null,
  roles: ['Admin'],
  permissions: [
    'students.read:any',
    'students.manage:any',
    'payments.read:any',
    'payments.manage:any',
    'enrollments.manage:any',
    'groups.read:any',
    'instructors.read:any',
  ],
  mustChangePassword: false,
  academy: { id: 'a1', name: 'KidzzyCoders', timezone: 'Africa/Cairo' },
};
const instructorUser: Me = {
  ...admin,
  id: 'ana-id',
  roles: ['Instructor'],
  permissions: ['students.read:own', 'payments.read:own', 'groups.read:own'],
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
const v1: PaymentPlan = {
  id: 'p1',
  payeeType: 'student',
  payeeId: mona.id,
  groupId: null,
  groupName: null,
  sessionsPerCycle: 4,
  amount: '1500.00',
  effectiveFromCycle: 1,
  createdAt: '2026-10-10T09:00:00.000Z',
};
const v2: PaymentPlan = {
  ...v1,
  id: 'p2',
  sessionsPerCycle: 8,
  amount: '2800.50',
  effectiveFromCycle: 2,
};

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
const problem = (status: number, code: string) =>
  json(status, { type: 'about:blank', title: 'Error', status, code });

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

const studentHandlers = (plans: PaymentPlan[]): Record<string, Handler> => ({
  [`GET /students/${mona.id}`]: () => json(200, mona),
  [`GET /students/${mona.id}/enrollments`]: () => json(200, { data: [] }),
  'GET /payment-plans': () => json(200, { data: plans }),
});

beforeEach(() => {
  calls = [];
  fetchMock = vi.spyOn(globalThis, 'fetch');
});
afterEach(() => vi.restoreAllMocks());

describe('the plan versions on the student profile', () => {
  it('lists the versions with the cycle each applies from, and offers the change to the admin', async () => {
    api(admin, studentHandlers([v1, v2]));
    renderAt(`/students/${mona.id}`);
    expect(await screen.findByText('2,800.50 ج.م.', { exact: false })).toBeInTheDocument();
    expect(screen.getByText(/1,500\.00/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'تغيير الخطة' })).toHaveAttribute(
      'href',
      `/students/${mona.id}/plan`,
    );
    const request = calls.find((c) => c.url.pathname.endsWith('/payment-plans'));
    expect(request?.url.searchParams.get('studentId')).toBe(mona.id);
  });

  it('shows an instructor no plan card, and never asks for the plans', async () => {
    api(instructorUser, studentHandlers([v1]));
    renderAt(`/students/${mona.id}`);
    expect(await screen.findByRole('heading', { name: 'منى' })).toBeInTheDocument();
    expect(screen.queryByText('خطة الدفع')).not.toBeInTheDocument();
    expect(calls.some((c) => c.url.pathname.endsWith('/payment-plans'))).toBe(false);
  });

  it('says so when the student has no plan yet, with no change button', async () => {
    api(admin, studentHandlers([]));
    renderAt(`/students/${mona.id}`);
    expect(await screen.findByText('مفيش خطة دفع لسه')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'تغيير الخطة' })).not.toBeInTheDocument();
  });
});

describe('changing the plan', () => {
  it('sends N and the amount as a decimal string, then opens the profile', async () => {
    api(admin, {
      ...studentHandlers([v1]),
      [`POST /students/${mona.id}/payment-plans`]: () => json(201, v2),
    });
    const router = renderAt(`/students/${mona.id}/plan`);
    const user = userEvent.setup();

    expect(await screen.findByText(/الخطة الحالية/)).toBeInTheDocument();
    await user.type(screen.getByLabelText('عدد سيشنات الدورة'), '8');
    await user.type(screen.getByLabelText('مبلغ الدورة (جنيه)'), '2,800.5');
    await user.click(screen.getByRole('button', { name: 'حفظ الخطة' }));

    await waitFor(() => expect(router.state.location.pathname).toBe(`/students/${mona.id}`));
    expect(calls.find((c) => c.method === 'POST')?.body).toEqual({
      sessionsPerCycle: 8,
      amount: '2800.50',
    });
  });

  it('shows PLAN_UNCHANGED when nothing changes', async () => {
    api(admin, {
      ...studentHandlers([v1]),
      [`POST /students/${mona.id}/payment-plans`]: () => problem(409, 'PLAN_UNCHANGED'),
    });
    renderAt(`/students/${mona.id}/plan`);
    const user = userEvent.setup();
    await screen.findByText(/الخطة الحالية/);
    await user.type(screen.getByLabelText('عدد سيشنات الدورة'), '4');
    await user.type(screen.getByLabelText('مبلغ الدورة (جنيه)'), '1500');
    await user.click(screen.getByRole('button', { name: 'حفظ الخطة' }));
    expect(
      await screen.findByText('دي نفس الخطة الحالية، غير العدد او المبلغ'),
    ).toBeInTheDocument();
  });

  it('shows the forbidden page to an instructor opening the change screen', async () => {
    api(instructorUser, studentHandlers([v1]));
    renderAt(`/students/${mona.id}/plan`);
    expect(
      await screen.findByRole('heading', { name: 'مش مسموح لك تفتح الصفحة دي' }),
    ).toBeInTheDocument();
  });
});

describe('an instructor’s plan, per group (US-21, ADR-0015)', () => {
  const ana: InstructorDetail = {
    id: '2d3e4f5a-6b7c-4d8e-9f0a-1b2c3d4e5f6a',
    name: 'Ana',
    email: 'ana@test.local',
    phone: null,
    isActive: true,
    createdAt: '2026-10-16T08:30:00.000Z',
    groups: [],
  };
  const group = (id: string, name: string): Group => ({
    id,
    name,
    level: 'Scratch 1',
    instructor: { id: ana.id, name: ana.name },
    startDate: '2026-10-01',
    isActive: true,
    schedule: [],
    studentCount: 0,
    heldCount: 0,
    nextSessionAt: null,
  });
  const groupA = group('ga-id', 'جروب A');
  const groupB = group('gb-id', 'جروب B');
  const planOf = (
    id: string,
    g: { id: string; name: string },
    over: Partial<PaymentPlan> = {},
  ) => ({
    ...v1,
    id,
    payeeType: 'instructor' as const,
    payeeId: ana.id,
    groupId: g.id,
    groupName: g.name,
    sessionsPerCycle: 8,
    amount: '2400.00',
    ...over,
  });
  const planA = planOf('p9', groupA);
  const planB = planOf('p10', groupB, { sessionsPerCycle: 4, amount: '1300.00' });
  const instructorHandlers = (
    plans: PaymentPlan[],
    taught: Group[] = [groupA, groupB],
  ): Record<string, Handler> => ({
    [`GET /instructors/${ana.id}`]: () => json(200, ana),
    'GET /payment-plans': () => json(200, { data: plans }),
    'GET /groups': () =>
      json(200, { data: taught, meta: { page: 1, pageSize: 100, total: taught.length } }),
  });
  const planPost = () => calls.find((c) => c.method === 'POST')?.body;

  it('offers to set a plan when there is none, and asks for the plans by instructorId', async () => {
    api(admin, instructorHandlers([]));
    renderAt(`/instructors/${ana.id}`);
    expect(await screen.findByText('مفيش خطة دفع لسه')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'تحديد او تغيير خطة جروب' })).toHaveAttribute(
      'href',
      `/instructors/${ana.id}/plan`,
    );
    const request = calls.find((c) => c.url.pathname.endsWith('/payment-plans'));
    expect(request?.url.searchParams.get('instructorId')).toBe(ana.id);
    expect(request?.url.searchParams.has('studentId')).toBe(false);
  });

  it('shows the versions group by group', async () => {
    api(
      admin,
      instructorHandlers([planA, planB, planOf('p11', groupA, { effectiveFromCycle: 2 })]),
    );
    renderAt(`/instructors/${ana.id}`);

    const headingA = await screen.findByRole('heading', { name: 'جروب A' });
    const headingB = screen.getByRole('heading', { name: 'جروب B' });
    expect(within(headingA.parentElement as HTMLElement).getAllByRole('row')).toHaveLength(3);
    expect(within(headingB.parentElement as HTMLElement).getAllByRole('row')).toHaveLength(2);
  });

  it('asks which group first, then asks for the starting point of that group’s first plan', async () => {
    api(admin, {
      ...instructorHandlers([]),
      [`POST /instructors/${ana.id}/payment-plans`]: () => json(201, planA),
    });
    const router = renderAt(`/instructors/${ana.id}/plan`);
    const user = userEvent.setup();

    expect(await screen.findByText(/اختار الجروب الاول/)).toBeInTheDocument();
    await user.selectOptions(screen.getByLabelText('الجروب'), groupA.id);
    expect(await screen.findByText(/ده اول خطة للمدرس في الجروب ده/)).toBeInTheDocument();
    await user.type(screen.getByLabelText('عدد سيشنات الدورة'), '8');
    await user.type(screen.getByLabelText('مبلغ الدورة (جنيه)'), '2400');
    await user.clear(screen.getByLabelText('نقطة البداية'));
    await user.type(screen.getByLabelText('نقطة البداية'), '2');
    await user.click(screen.getByRole('button', { name: 'حفظ الخطة' }));

    await waitFor(() => expect(router.state.location.pathname).toBe(`/instructors/${ana.id}`));
    expect(planPost()).toEqual({
      sessionsPerCycle: 8,
      amount: '2400.00',
      groupId: groupA.id,
      openingCount: 2,
    });
  });

  it('a group with a plan has no starting point, another group still does', async () => {
    api(admin, {
      ...instructorHandlers([planA]),
      [`POST /instructors/${ana.id}/payment-plans`]: () =>
        json(201, planOf('p12', groupA, { effectiveFromCycle: 2 })),
    });
    renderAt(`/instructors/${ana.id}/plan`);
    const user = userEvent.setup();

    await screen.findByLabelText('الجروب');
    await user.selectOptions(screen.getByLabelText('الجروب'), groupA.id);
    expect(await screen.findByText(/الخطة الحالية/)).toBeInTheDocument();
    expect(screen.queryByLabelText('نقطة البداية')).not.toBeInTheDocument();
    await user.selectOptions(screen.getByLabelText('الجروب'), groupB.id);
    expect(await screen.findByText(/ده اول خطة للمدرس في الجروب ده/)).toBeInTheDocument();
    expect(screen.getByLabelText('نقطة البداية')).toBeInTheDocument();

    await user.selectOptions(screen.getByLabelText('الجروب'), groupA.id);
    await user.type(screen.getByLabelText('عدد سيشنات الدورة'), '12');
    await user.type(screen.getByLabelText('مبلغ الدورة (جنيه)'), '3500');
    await user.click(screen.getByRole('button', { name: 'حفظ الخطة' }));
    await waitFor(() => expect(planPost()).toBeDefined());
    expect(planPost()).toEqual({ sessionsPerCycle: 12, amount: '3500.00', groupId: groupA.id });
  });

  it('offers a group the instructor has a plan for but no longer teaches, and says so', async () => {
    const former = group('gc-id', 'جروب C');
    api(admin, instructorHandlers([planOf('p13', former)], [groupA]));
    renderAt(`/instructors/${ana.id}/plan`);

    const select = await screen.findByLabelText('الجروب');
    expect(within(select).getByRole('option', { name: 'جروب A' })).toBeInTheDocument();
    expect(
      within(select).getByRole('option', { name: 'جروب C (مش بيدرّس فيه دلوقتي)' }),
    ).toBeInTheDocument();
  });

  it('chooses the only group by itself', async () => {
    api(admin, instructorHandlers([], [groupA]));
    renderAt(`/instructors/${ana.id}/plan`);

    expect(await screen.findByText(/ده اول خطة للمدرس في الجروب ده/)).toBeInTheDocument();
    expect(screen.getByLabelText('الجروب')).toHaveValue(groupA.id);
  });

  it('asks for the group when none is chosen, and sends nothing', async () => {
    api(admin, instructorHandlers([]));
    renderAt(`/instructors/${ana.id}/plan`);
    const user = userEvent.setup();

    await screen.findByLabelText('الجروب');
    await user.type(screen.getByLabelText('عدد سيشنات الدورة'), '8');
    await user.type(screen.getByLabelText('مبلغ الدورة (جنيه)'), '2400');
    await user.click(screen.getByRole('button', { name: 'حفظ الخطة' }));

    expect(await screen.findByText('اختار الجروب', { selector: 'p' })).toBeInTheDocument();
    expect(calls.some((c) => c.method === 'POST')).toBe(false);
  });

  it('says the instructor must teach the group for its first plan', async () => {
    api(admin, {
      ...instructorHandlers([]),
      [`POST /instructors/${ana.id}/payment-plans`]: () => problem(422, 'INSTRUCTOR_NOT_IN_GROUP'),
    });
    renderAt(`/instructors/${ana.id}/plan`);
    const user = userEvent.setup();

    await screen.findByLabelText('الجروب');
    await user.selectOptions(screen.getByLabelText('الجروب'), groupA.id);
    await user.type(screen.getByLabelText('عدد سيشنات الدورة'), '8');
    await user.type(screen.getByLabelText('مبلغ الدورة (جنيه)'), '2400');
    await user.click(screen.getByRole('button', { name: 'حفظ الخطة' }));

    expect(
      await screen.findByText('المدرس ده مش مدرس الجروب ده دلوقتي، فمينفعش نحدد له اول خطة للجروب'),
    ).toBeInTheDocument();
  });

  it('shows STARTING_POINT_OUT_OF_RANGE under the starting point', async () => {
    api(admin, {
      ...instructorHandlers([], [groupA]),
      [`POST /instructors/${ana.id}/payment-plans`]: () =>
        problem(422, 'STARTING_POINT_OUT_OF_RANGE'),
    });
    renderAt(`/instructors/${ana.id}/plan`);
    const user = userEvent.setup();
    await screen.findByText(/ده اول خطة للمدرس في الجروب ده/);
    await user.type(screen.getByLabelText('عدد سيشنات الدورة'), '8');
    await user.type(screen.getByLabelText('مبلغ الدورة (جنيه)'), '2400');
    await user.clear(screen.getByLabelText('نقطة البداية'));
    await user.type(screen.getByLabelText('نقطة البداية'), '8');
    await user.click(screen.getByRole('button', { name: 'حفظ الخطة' }));
    await waitFor(() =>
      expect(screen.getByLabelText('نقطة البداية')).toHaveAttribute('aria-invalid', 'true'),
    );
  });

  it('tells the admin when the instructor has no group at all', async () => {
    api(admin, instructorHandlers([], []));
    renderAt(`/instructors/${ana.id}/plan`);

    expect(await screen.findByText(/مش مدرس اي جروب دلوقتي/)).toBeInTheDocument();
  });

  it('shows the forbidden page to an instructor opening the plan screen', async () => {
    api(instructorUser, instructorHandlers([planA]));
    renderAt(`/instructors/${ana.id}/plan`);
    expect(
      await screen.findByRole('heading', { name: 'مش مسموح لك تفتح الصفحة دي' }),
    ).toBeInTheDocument();
  });
});

describe('an instructor’s cycles, per group (US-24, US-25)', () => {
  const ana: InstructorDetail = {
    id: '2d3e4f5a-6b7c-4d8e-9f0a-1b2c3d4e5f6a',
    name: 'Ana',
    email: 'ana@test.local',
    phone: null,
    isActive: true,
    createdAt: '2026-10-16T08:30:00.000Z',
    groups: [],
  };
  const cycle = (id: string, group: string, over: Partial<PaymentCycle> = {}): PaymentCycle => ({
    id,
    payeeType: 'instructor',
    payeeId: ana.id,
    payeeName: ana.name,
    groupId: 'g-' + group,
    groupName: 'جروب ' + group,
    cycleNumber: 1,
    sessionsPerCycle: 8,
    amount: '2400.00',
    openingCount: 0,
    sessionsCounted: 0,
    status: 'in_progress',
    dueAt: null,
    paidAt: null,
    ...over,
  });
  const page = (data: PaymentCycle[]) => ({
    data,
    meta: { page: 1, pageSize: 100, total: data.length },
  });
  const cycleCalls = () => calls.filter((c) => c.url.pathname.endsWith('/payment-cycles'));

  it('shows the admin each group’s cycle with its counter, and the starting point it began from', async () => {
    api(admin, {
      [`GET /instructors/${ana.id}`]: () => json(200, ana),
      'GET /payment-plans': () => json(200, { data: [] }),
      'GET /payment-cycles': () =>
        json(
          200,
          page([
            cycle('c1', 'أ', { openingCount: 3, sessionsCounted: 3 }),
            cycle('c2', 'ب', { sessionsPerCycle: 4, amount: '1300.00', sessionsCounted: 1 }),
          ]),
        ),
    });
    renderAt(`/instructors/${ana.id}`);

    const headingA = await screen.findByRole('heading', { name: 'جروب أ' });
    const headingB = screen.getByRole('heading', { name: 'جروب ب' });
    const blockA = within(headingA.parentElement as HTMLElement);
    const blockB = within(headingB.parentElement as HTMLElement);
    expect(blockA.getByText('3 من 8 سيشن')).toBeInTheDocument();
    expect(blockA.getByText(/بدأت من 3 سيشن/)).toBeInTheDocument();
    expect(blockB.getByText('1 من 4 سيشن')).toBeInTheDocument();
    expect(blockB.queryByText(/بدأت من/)).not.toBeInTheDocument();

    const request = cycleCalls()[0];
    expect(request?.url.searchParams.get('instructorId')).toBe(ana.id);
    expect(request?.url.searchParams.get('payeeType')).toBe('instructor');
  });

  it('shows a Due cycle and the latest cycle first, as the API sent them', async () => {
    api(admin, {
      [`GET /instructors/${ana.id}`]: () => json(200, ana),
      'GET /payment-plans': () => json(200, { data: [] }),
      'GET /payment-cycles': () =>
        json(
          200,
          page([
            cycle('c2', 'أ', { cycleNumber: 2, sessionsCounted: 1 }),
            cycle('c1', 'أ', {
              cycleNumber: 1,
              sessionsCounted: 8,
              status: 'due',
              dueAt: '2026-10-20T10:00:00.000Z',
            }),
          ]),
        ),
    });
    renderAt(`/instructors/${ana.id}`);

    const heading = await screen.findByRole('heading', { name: 'جروب أ' });
    const rows = within(heading.parentElement as HTMLElement).getAllByRole('listitem');
    expect(rows).toHaveLength(2);
    expect(rows[0]).toHaveTextContent('الدورة 2');
    expect(rows[1]).toHaveTextContent('الدورة 1');
    expect(rows[1]).toHaveTextContent('مستحقة');
  });

  it('tells the admin there are no cycles yet', async () => {
    api(admin, {
      [`GET /instructors/${ana.id}`]: () => json(200, ana),
      'GET /payment-plans': () => json(200, { data: [] }),
      'GET /payment-cycles': () => json(200, page([])),
    });
    renderAt(`/instructors/${ana.id}`);

    expect(await screen.findByText('مفيش دورات')).toBeInTheDocument();
    expect(screen.getByText(/حدد خطة المدرس لكل جروب/)).toBeInTheDocument();
  });

  it('shows an instructor their own cycles on the home screen, asking without an instructorId', async () => {
    api(instructorUser, {
      'GET /payment-cycles': () =>
        json(200, page([cycle('c1', 'أ', { openingCount: 2, sessionsCounted: 2 })])),
    });
    renderAt('/');

    expect(await screen.findByText('دوراتي')).toBeInTheDocument();
    expect(await screen.findByText(/بدأت من 2 سيشن/)).toBeInTheDocument();
    const request = cycleCalls()[0];
    expect(request?.url.searchParams.has('instructorId')).toBe(false);
    expect(request?.url.searchParams.get('payeeType')).toBe('instructor');
  });

  it('tells an instructor with no plan yet that the admin sets it', async () => {
    api(instructorUser, { 'GET /payment-cycles': () => json(200, page([])) });
    renderAt('/');

    expect(await screen.findByText(/الأدمن هيحدد خطة الدفع بتاعتك لكل جروب/)).toBeInTheDocument();
  });

  it('does not show the admin the “my cycles” card, nor ask for cycles on the home screen', async () => {
    api(admin);
    renderAt('/');

    await screen.findAllByText('الرئيسية');
    await waitFor(() => expect(calls.some((c) => c.url.pathname.endsWith('/auth/me'))).toBe(true));
    expect(screen.queryByText('دوراتي')).not.toBeInTheDocument();
    expect(cycleCalls()).toHaveLength(0);
  });

  it('stays quiet when the cycles are refused', async () => {
    api(instructorUser, { 'GET /payment-cycles': () => problem(403, 'FORBIDDEN') });
    renderAt('/');

    expect(await screen.findByText('دوراتي')).toBeInTheDocument();
    await waitFor(() => expect(cycleCalls().length).toBeGreaterThan(0));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});
