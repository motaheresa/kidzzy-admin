import type { InstructorDetail, Me, PaymentPlan, Student } from '@kidzzy/shared';
import { render, screen, waitFor } from '@testing-library/react';
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

describe('an instructor’s plan (US-21)', () => {
  const ana: InstructorDetail = {
    id: '2d3e4f5a-6b7c-4d8e-9f0a-1b2c3d4e5f6a',
    name: 'Ana',
    email: 'ana@test.local',
    phone: null,
    isActive: true,
    createdAt: '2026-10-16T08:30:00.000Z',
    groups: [],
  };
  const anaPlan: PaymentPlan = {
    ...v1,
    id: 'p9',
    payeeType: 'instructor',
    payeeId: ana.id,
    sessionsPerCycle: 8,
    amount: '2400.00',
  };
  const instructorHandlers = (plans: PaymentPlan[]): Record<string, Handler> => ({
    [`GET /instructors/${ana.id}`]: () => json(200, ana),
    'GET /payment-plans': () => json(200, { data: plans }),
  });

  it('offers to set the plan when there is none, and asks for the instructor’s plan by instructorId', async () => {
    api(admin, instructorHandlers([]));
    renderAt(`/instructors/${ana.id}`);
    expect(await screen.findByText('مفيش خطة دفع لسه')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'تحديد الخطة' })).toHaveAttribute(
      'href',
      `/instructors/${ana.id}/plan`,
    );
    const request = calls.find((c) => c.url.pathname.endsWith('/payment-plans'));
    expect(request?.url.searchParams.get('instructorId')).toBe(ana.id);
    expect(request?.url.searchParams.has('studentId')).toBe(false);
  });

  it('the first plan asks for the starting point and sends it with the amount as a string', async () => {
    api(admin, {
      ...instructorHandlers([]),
      [`POST /instructors/${ana.id}/payment-plans`]: () => json(201, anaPlan),
    });
    const router = renderAt(`/instructors/${ana.id}/plan`);
    const user = userEvent.setup();

    expect(await screen.findByText(/ده اول خطة للمدرس/)).toBeInTheDocument();
    await user.type(screen.getByLabelText('عدد سيشنات الدورة'), '8');
    await user.type(screen.getByLabelText('مبلغ الدورة (جنيه)'), '2400');
    await user.clear(screen.getByLabelText('نقطة البداية'));
    await user.type(screen.getByLabelText('نقطة البداية'), '2');
    await user.click(screen.getByRole('button', { name: 'حفظ الخطة' }));

    await waitFor(() => expect(router.state.location.pathname).toBe(`/instructors/${ana.id}`));
    expect(calls.find((c) => c.method === 'POST')?.body).toEqual({
      sessionsPerCycle: 8,
      amount: '2400.00',
      openingCount: 2,
    });
  });

  it('a later plan has no starting point, shows the versions, and sends none', async () => {
    api(admin, {
      ...instructorHandlers([anaPlan]),
      [`POST /instructors/${ana.id}/payment-plans`]: () =>
        json(201, { ...anaPlan, id: 'p10', effectiveFromCycle: 2 }),
    });
    renderAt(`/instructors/${ana.id}/plan`);
    const user = userEvent.setup();
    expect(await screen.findByText(/الخطة الحالية/)).toBeInTheDocument();
    expect(screen.queryByLabelText('نقطة البداية')).not.toBeInTheDocument();
    await user.type(screen.getByLabelText('عدد سيشنات الدورة'), '12');
    await user.type(screen.getByLabelText('مبلغ الدورة (جنيه)'), '3500');
    await user.click(screen.getByRole('button', { name: 'حفظ الخطة' }));
    await waitFor(() => expect(calls.some((c) => c.method === 'POST')).toBe(true));
    expect(calls.find((c) => c.method === 'POST')?.body).toEqual({
      sessionsPerCycle: 12,
      amount: '3500.00',
    });
  });

  it('shows STARTING_POINT_OUT_OF_RANGE under the starting point', async () => {
    api(admin, {
      ...instructorHandlers([]),
      [`POST /instructors/${ana.id}/payment-plans`]: () =>
        problem(422, 'STARTING_POINT_OUT_OF_RANGE'),
    });
    renderAt(`/instructors/${ana.id}/plan`);
    const user = userEvent.setup();
    await screen.findByText(/ده اول خطة للمدرس/);
    await user.type(screen.getByLabelText('عدد سيشنات الدورة'), '8');
    await user.type(screen.getByLabelText('مبلغ الدورة (جنيه)'), '2400');
    await user.clear(screen.getByLabelText('نقطة البداية'));
    await user.type(screen.getByLabelText('نقطة البداية'), '8');
    await user.click(screen.getByRole('button', { name: 'حفظ الخطة' }));
    await waitFor(() =>
      expect(screen.getByLabelText('نقطة البداية')).toHaveAttribute('aria-invalid', 'true'),
    );
  });

  it('shows the forbidden page to an instructor opening the plan screen', async () => {
    api(instructorUser, instructorHandlers([anaPlan]));
    renderAt(`/instructors/${ana.id}/plan`);
    expect(
      await screen.findByRole('heading', { name: 'مش مسموح لك تفتح الصفحة دي' }),
    ).toBeInTheDocument();
  });
});
