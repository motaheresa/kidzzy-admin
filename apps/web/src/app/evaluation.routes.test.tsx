import type { EvaluationRequest, Me, Page, Student, StudentEvaluation } from '@kidzzy/shared';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest';
import { AppProviders } from './providers';
import { routes } from './router';

// US-42 (SCRUM-87) through the real routes, with the API mocked at fetch.

const instructor: Me = {
  id: 'ana-id',
  name: 'Ana',
  email: 'ana@test.local',
  phone: null,
  roles: ['Instructor'],
  permissions: ['students.read:own', 'groups.read:own', 'evaluations.write:own'],
  mustChangePassword: false,
  pendingEvaluations: 0,
  academy: { id: 'a1', name: 'KidzzyCoders', timezone: 'Africa/Cairo' },
};

const admin: Me = {
  ...instructor,
  id: 'admin-1',
  name: 'Mona',
  roles: ['Admin'],
  permissions: [
    'students.read:any',
    'students.manage:any',
    'evaluations.read:any',
    'evaluations.manage:any',
  ],
};

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
const problem = (status: number, code: string, errors?: unknown) =>
  json(status, { type: 'about:blank', title: 'Error', status, code, errors });
const noContent = () => new Response(null, { status: 204 });
const emptyPage = <T,>(): Page<T> => ({ data: [], meta: { page: 1, pageSize: 20, total: 0 } });

const request = (
  id: string,
  name: string,
  over: Partial<EvaluationRequest> = {},
): EvaluationRequest => ({
  id,
  source: 'cycle_due',
  status: 'pending',
  student: { id: `st-${id}`, name },
  group: { id: 'g1', name: 'Scratch A' },
  instructor: { id: 'ana-id', name: 'Ana' },
  cycleNumber: 2,
  requestedAt: '2026-11-18T10:00:00.000Z',
  ...over,
});

const written: StudentEvaluation = {
  id: 'ev1',
  source: 'cycle_due',
  student: { id: 'st1', name: 'Aya' },
  group: { id: 'g1', name: 'Scratch A' },
  instructor: { id: 'ana-id', name: 'Ana' },
  cycleNumber: 2,
  overallRating: 4,
  summary: 'Worked steadily this month and finished both projects.',
  strengths: 'Loops',
  toImprove: null,
  submittedAt: '2026-11-18T12:00:00.000Z',
};

type Handler = (body: unknown) => Response;
let fetchMock: MockInstance<typeof fetch>;
let calls: { method: string; path: string; body: unknown }[];
let me: Me;

function api(handlers: Record<string, Handler> = {}) {
  fetchMock.mockImplementation((input, init = {}) => {
    const url = new URL(String(input), 'http://localhost');
    const method = init.method ?? 'GET';
    const path = url.pathname.replace('/api/v1', '');
    const body = init.body ? JSON.parse(String(init.body)) : undefined;
    calls.push({ method, path: path + url.search, body });
    if (path === '/auth/me') return Promise.resolve(json(200, me));
    if (path === '/auth/refresh') return Promise.resolve(noContent());
    const handler = handlers[`${method} ${path}`];
    return Promise.resolve(handler ? handler(body) : problem(404, 'NOT_FOUND'));
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

const called = (method: string, path: string) =>
  calls.filter((c) => c.method === method && c.path.startsWith(path));

beforeEach(() => {
  calls = [];
  me = instructor;
  fetchMock = vi.spyOn(globalThis, 'fetch');
});
afterEach(() => vi.restoreAllMocks());

describe('the evaluation gate', () => {
  it('opens only the evaluation screen when /auth/me says one is pending', async () => {
    me = { ...instructor, pendingEvaluations: 1 };
    api({ 'GET /me/evaluation-requests': () => json(200, [request('r1', 'Aya')]) });
    const router = renderAt('/students?isActive=true');

    expect(await screen.findByRole('heading', { name: 'تقييم مطلوب' })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/evaluation');
    expect(new URLSearchParams(router.state.location.search).get('returnTo')).toBe(
      '/students?isActive=true',
    );
    expect(screen.queryByRole('navigation', { name: 'الأقسام' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /خروج/ })).toBeInTheDocument();
    expect(await screen.findByText('Aya')).toBeInTheDocument();
    expect(called('GET', '/students')).toHaveLength(0);
  });

  it('opens it when a request answers 403 EVALUATION_REQUIRED, without a toast', async () => {
    api({
      'GET /students': () => {
        me = { ...instructor, pendingEvaluations: 1 };
        return problem(403, 'EVALUATION_REQUIRED');
      },
      'GET /me/evaluation-requests': () => json(200, [request('r1', 'Aya')]),
    });
    const router = renderAt('/students');
    await waitFor(() => expect(router.state.location.pathname).toBe('/evaluation'));
    expect(screen.queryByText('لازم تكتب التقييم المطلوب الأول')).not.toBeInTheDocument();
  });

  it('lets the password gate come first', async () => {
    me = { ...instructor, mustChangePassword: true, pendingEvaluations: 1 };
    api();
    const router = renderAt('/students');
    await waitFor(() => expect(router.state.location.pathname).toBe('/change-password'));
  });
});

describe('the evaluation screen', () => {
  it('checks the rating and a 20-character summary before sending, with a live counter', async () => {
    me = { ...instructor, pendingEvaluations: 1 };
    api({ 'GET /me/evaluation-requests': () => json(200, [request('r1', 'Aya')]) });
    renderAt('/evaluation');
    const form = await screen.findByRole('form', { name: 'تقييم Aya' });
    const user = userEvent.setup();

    expect(within(form).getByText(/0 \/ 2,000/)).toBeInTheDocument();
    await user.type(within(form).getByLabelText(/ملخص الشهر/), 'short');
    expect(within(form).getByText(/5 \/ 2,000/)).toBeInTheDocument();
    await user.click(within(form).getByRole('button', { name: 'ابعت التقييم' }));

    expect(within(form).getByText('اختار تقييم من 1 لـ 5')).toBeInTheDocument();
    expect(within(form).getByLabelText(/ملخص الشهر/)).toHaveAttribute('aria-invalid', 'true');
    expect(called('POST', '/evaluation-requests')).toHaveLength(0);
  });

  it('sends the evaluation, then refreshes the session and returns where the user was', async () => {
    me = { ...instructor, pendingEvaluations: 1 };
    let pending = [request('r1', 'Aya')];
    api({
      'GET /me/evaluation-requests': () => json(200, pending),
      'POST /evaluation-requests/r1/submit': () => {
        pending = [];
        me = { ...instructor, pendingEvaluations: 0 };
        return json(200, written);
      },
      'GET /students': () => json(200, emptyPage<Student>()),
    });
    const router = renderAt('/evaluation?returnTo=%2Fstudents');
    const form = await screen.findByRole('form', { name: 'تقييم Aya' });
    const user = userEvent.setup();

    await user.click(within(form).getByRole('radio', { name: '4 من 5' }));
    await user.type(
      within(form).getByLabelText(/ملخص الشهر/),
      '  Worked steadily this month and finished both projects.  ',
    );
    await user.type(within(form).getByLabelText(/نقاط القوة/), 'Loops');
    await user.click(within(form).getByRole('button', { name: 'ابعت التقييم' }));

    await waitFor(() => expect(router.state.location.pathname).toBe('/students'));
    expect(called('POST', '/evaluation-requests/r1/submit')[0]?.body).toEqual({
      overallRating: 4,
      summary: 'Worked steadily this month and finished both projects.',
      strengths: 'Loops',
      toImprove: null,
    });
    expect(called('POST', '/auth/refresh')).toHaveLength(1);
    expect(screen.getByRole('navigation', { name: 'الأقسام' })).toBeInTheDocument();
  });

  it('stays on the screen while another evaluation is still pending', async () => {
    me = { ...instructor, pendingEvaluations: 2 };
    let pending = [
      request('r1', 'Aya'),
      request('r2', 'Omar', { source: 'admin', cycleNumber: null }),
    ];
    api({
      'GET /me/evaluation-requests': () => json(200, pending),
      'POST /evaluation-requests/r1/submit': () => {
        pending = pending.slice(1);
        return json(200, written);
      },
    });
    const router = renderAt('/evaluation');
    expect(await screen.findByText('طلب من الإدارة', { exact: false })).toBeInTheDocument();
    const form = screen.getByRole('form', { name: 'تقييم Aya' });
    const user = userEvent.setup();
    await user.click(within(form).getByRole('radio', { name: '5 من 5' }));
    await user.type(
      within(form).getByLabelText(/ملخص الشهر/),
      'A very good month for Aya overall.',
    );
    await user.click(within(form).getByRole('button', { name: 'ابعت التقييم' }));

    await waitFor(() =>
      expect(screen.queryByRole('form', { name: 'تقييم Aya' })).not.toBeInTheDocument(),
    );
    expect(screen.getByRole('form', { name: 'تقييم Omar' })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/evaluation');
    expect(called('POST', '/auth/refresh')).toHaveLength(0);
  });

  it('shows the API validation under the field', async () => {
    me = { ...instructor, pendingEvaluations: 1 };
    api({
      'GET /me/evaluation-requests': () => json(200, [request('r1', 'Aya')]),
      'POST /evaluation-requests/r1/submit': () =>
        problem(400, 'VALIDATION_FAILED', [{ field: 'strengths', message: 'too long' }]),
    });
    renderAt('/evaluation');
    const form = await screen.findByRole('form', { name: 'تقييم Aya' });
    const user = userEvent.setup();
    await user.click(within(form).getByRole('radio', { name: '3 من 5' }));
    await user.type(within(form).getByLabelText(/ملخص الشهر/), 'A good month with steady work.');
    await user.click(within(form).getByRole('button', { name: 'ابعت التقييم' }));
    await waitFor(() =>
      expect(within(form).getByLabelText(/نقاط القوة/)).toHaveAttribute('aria-invalid', 'true'),
    );
  });
});

/** The card whose title is `title` (CardTitle is not a heading), or undefined. */
const cardTitled = (title: string) =>
  screen
    .queryAllByText(title)
    .map((el) => el.closest('[data-slot="card"]'))
    .find((card): card is HTMLElement => card instanceof HTMLElement);

async function evaluationsCard(): Promise<HTMLElement> {
  let card: HTMLElement | undefined;
  await waitFor(() => {
    card = cardTitled('التقييمات');
    expect(card).toBeDefined();
  });
  return card!;
}

describe('the admin', () => {
  it('turns the rule on from the settings screen, reached from the navigation', async () => {
    me = admin;
    let required = false;
    api({
      'GET /academy/settings': () => json(200, { evaluationsRequired: required }),
      'PATCH /academy/settings': (body) => {
        required = (body as { evaluationsRequired: boolean }).evaluationsRequired;
        return json(200, { evaluationsRequired: required });
      },
      'GET /evaluation-requests': () => json(200, []),
      'GET /students': () => json(200, emptyPage<Student>()),
    });
    renderAt('/students');
    const user = userEvent.setup();
    const nav = await screen.findByRole('navigation', { name: 'الأقسام' });
    await user.click(within(nav).getByRole('link', { name: 'التقييمات' }));

    const toggle = await screen.findByRole('switch');
    expect(toggle).toHaveAttribute('aria-checked', 'false');
    await user.click(toggle);
    await waitFor(() => expect(called('PATCH', '/academy/settings')).toHaveLength(1));
    expect(called('PATCH', '/academy/settings')[0]?.body).toEqual({ evaluationsRequired: true });
    await waitFor(() => expect(screen.getByRole('switch')).toHaveAttribute('aria-checked', 'true'));
    expect(screen.getByText('مفيش طلبات تقييم مستنية')).toBeInTheDocument();
  });

  it('cancels a pending request after confirming', async () => {
    me = admin;
    let pending = [request('r1', 'Aya')];
    api({
      'GET /academy/settings': () => json(200, { evaluationsRequired: true }),
      'GET /evaluation-requests': () => json(200, pending),
      'POST /evaluation-requests/r1/cancel': () => {
        pending = [];
        return json(200, { ...request('r1', 'Aya'), status: 'cancelled' });
      },
    });
    renderAt('/settings/evaluations');
    const user = userEvent.setup();
    const table = await screen.findByRole('table');
    expect(within(table).getByText('Aya')).toBeInTheDocument();
    await user.click(within(table).getByRole('button', { name: 'إلغاء' }));
    await user.click(await screen.findByRole('button', { name: 'إلغاء الطلب' }));

    await waitFor(() => expect(called('POST', '/evaluation-requests/r1/cancel')).toHaveLength(1));
    expect(await screen.findByText('مفيش طلبات تقييم مستنية')).toBeInTheDocument();
  });

  it('is not offered the settings screen without evaluations.manage', async () => {
    me = { ...admin, permissions: ['students.read:any'] };
    api({ 'GET /students': () => json(200, emptyPage<Student>()) });
    renderAt('/students');
    const nav = await screen.findByRole('navigation', { name: 'الأقسام' });
    expect(within(nav).queryByRole('link', { name: 'التقييمات' })).not.toBeInTheDocument();
  });

  it('asks for an evaluation from the student page, and shows the written ones', async () => {
    me = admin;
    api({
      'GET /students/st1/evaluations': () => json(200, [written]),
      'POST /students/st1/evaluation-requests': () => problem(409, 'EVALUATION_PENDING'),
    });
    renderAt('/students/st1');
    const section = await evaluationsCard();
    expect(await within(section).findByText(written.summary)).toBeInTheDocument();
    expect(within(section).getByText('4 من 5')).toBeInTheDocument();

    const user = userEvent.setup();
    await user.click(within(section).getByRole('button', { name: 'طلب تقييم دلوقتي' }));
    await user.click(await screen.findByRole('button', { name: 'ابعت الطلب' }));
    expect(await screen.findByText('فيه طلب تقييم للطالب ده لسه مستني')).toBeInTheDocument();
    expect(called('POST', '/students/st1/evaluation-requests')).toHaveLength(1);
  });

  it('hides the request button and the section without the permissions', async () => {
    me = { ...admin, permissions: ['students.read:any'] };
    api();
    renderAt('/students/st1');
    await waitFor(() => expect(calls.length).toBeGreaterThan(1));
    expect(cardTitled('التقييمات')).toBeUndefined();
    expect(called('GET', '/students/st1/evaluations')).toHaveLength(0);
  });
});
