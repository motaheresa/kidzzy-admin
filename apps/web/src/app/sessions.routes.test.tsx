import type { Me, Page, Session } from '@kidzzy/shared';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest';
import { AppProviders } from './providers';
import { routes } from './router';

// The session screens (US-12) through the real routes, with the API mocked at fetch.
// "Now" is Thursday 2026-10-22 at 13:00 in Cairo, so today is that calendar day.

const NOW = new Date('2026-10-22T10:00:00.000Z');

const admin: Me = {
  id: 'admin-1',
  name: 'Mohamed',
  email: 'admin@test.local',
  phone: null,
  roles: ['Admin'],
  permissions: ['sessions.read:any', 'groups.read:any'],
  mustChangePassword: false,
  academy: { id: 'a1', name: 'KidzzyCoders', timezone: 'Africa/Cairo' },
};
const instructorUser: Me = {
  ...admin,
  id: 'inst-1',
  roles: ['Instructor'],
  permissions: ['sessions.read:own', 'groups.read:own'],
};
const noSessions: Me = { ...admin, permissions: ['groups.read:any'] };

const session: Session = {
  id: '8a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d',
  group: { id: '3c1d2e4f-5a6b-4c7d-8e9f-0a1b2c3d4e5f', name: 'جروب A' },
  instructorId: 'inst-1',
  scheduledAt: '2026-10-22T14:00:00.000Z',
  durationMin: 60,
  status: 'scheduled',
  sessionNumber: null,
  isMakeup: false,
  compensatesSessionId: null,
  cancelReason: null,
};

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
const problem = (status: number, code: string) =>
  json(status, { type: 'about:blank', title: 'Error', status, code });
const page = (data: Session[]): Page<Session> => ({
  data,
  meta: { page: 1, pageSize: 20, total: data.length },
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

function sessionCalls() {
  return calls.filter((call) => call.url.pathname.endsWith('/sessions'));
}

beforeEach(() => {
  calls = [];
  fetchMock = vi.spyOn(globalThis, 'fetch');
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("today's sessions", () => {
  it('lists the sessions of the Cairo day and links each one', async () => {
    api(admin, { 'GET /sessions': () => json(200, page([session])) });
    renderAt('/');

    const link = await screen.findByRole('link', { name: /جروب A/ });
    expect(link).toHaveAttribute('href', `/sessions/${session.id}`);
    expect(screen.getByText('مجدولة')).toBeInTheDocument();
    expect(screen.getByText('5:00 م')).toBeInTheDocument();

    await waitFor(() => expect(sessionCalls().length).toBeGreaterThan(0));
    const query = sessionCalls().at(-1)?.url.searchParams;
    // Local midnight inclusive, next local midnight exclusive (UTC+3).
    expect(query?.get('from')).toBe('2026-10-21T21:00:00.000Z');
    expect(query?.get('to')).toBe('2026-10-22T21:00:00.000Z');
  });

  it('says the day is empty', async () => {
    api(instructorUser, { 'GET /sessions': () => json(200, page([])) });
    renderAt('/');
    expect(await screen.findByText('مفيش حصص النهارده')).toBeInTheDocument();
  });

  it('stays off the home screen when the caller cannot read sessions', async () => {
    api(noSessions);
    renderAt('/');
    expect(await screen.findByRole('heading', { name: 'الرئيسية' })).toBeInTheDocument();
    expect(screen.queryByText('سيشنات النهارده')).not.toBeInTheDocument();
    expect(sessionCalls()).toHaveLength(0);
  });
});

describe('a group’s sessions', () => {
  const groupPath = `/groups/${session.group.id}`;

  it('filters by status in the URL', async () => {
    api(admin, {
      'GET /sessions': (url) =>
        json(200, page(url.searchParams.get('status') === 'held' ? [] : [session])),
      [`GET ${groupPath}`]: () =>
        json(200, {
          id: session.group.id,
          name: session.group.name,
          level: 'Scratch 1',
          instructor: { id: 'inst-1', name: 'Ana' },
          startDate: '2026-10-01',
          isActive: true,
          schedule: [],
          studentCount: 0,
          heldCount: 0,
          nextSessionAt: null,
        }),
      [`GET ${groupPath}/enrollments`]: () => json(200, { data: [] }),
    });
    const router = renderAt(groupPath);
    expect(await screen.findByRole('link', { name: /22 أكتوبر 2026/ })).toHaveAttribute(
      'href',
      `/sessions/${session.id}`,
    );

    await userEvent.setup().click(screen.getByRole('radio', { name: 'اتعملت' }));
    expect(await screen.findByText('مفيش حصص بالحالة دي')).toBeInTheDocument();
    expect(router.state.location.search).toBe('?status=held');
    await waitFor(() => expect(sessionCalls().at(-1)?.url.searchParams.get('status')).toBe('held'));
    expect(sessionCalls().at(-1)?.url.searchParams.get('groupId')).toBe(session.group.id);
  });
});

describe('session details', () => {
  it('shows the session and no actions yet', async () => {
    api(admin, { [`GET /sessions/${session.id}`]: () => json(200, session) });
    renderAt(`/sessions/${session.id}`);
    expect(await screen.findByRole('heading', { name: 'جروب A' })).toBeInTheDocument();
    expect(screen.getByText('مجدولة')).toBeInTheDocument();
    expect(screen.getByText('60 دقيقة')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'ارجع للجروب' })).toHaveAttribute(
      'href',
      `/groups/${session.group.id}`,
    );
    expect(screen.queryByRole('button', { name: 'اتعملت' })).not.toBeInTheDocument();
  });

  it('says a missing session is gone', async () => {
    api(admin, { [`GET /sessions/${session.id}`]: () => problem(404, 'NOT_FOUND') });
    renderAt(`/sessions/${session.id}`);
    expect(await screen.findByText('الحصة دي مش موجودة')).toBeInTheDocument();
  });

  it("says another instructor's session is not theirs", async () => {
    api(instructorUser, { [`GET /sessions/${session.id}`]: () => problem(403, 'FORBIDDEN') });
    renderAt(`/sessions/${session.id}`);
    expect(await screen.findByText('الحصة دي مش بتاعتك')).toBeInTheDocument();
  });

  it('refuses the screen to someone without sessions.read', async () => {
    api(noSessions);
    renderAt(`/sessions/${session.id}`);
    expect(
      await screen.findByRole('heading', { name: 'مش مسموح لك تفتح الصفحة دي' }),
    ).toBeInTheDocument();
  });
});
