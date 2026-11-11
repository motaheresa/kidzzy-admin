import type { Dashboard, Me } from '@kidzzy/shared';
import { render, screen, within } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest';
import { AppProviders } from './providers';
import { routes } from './router';

// The admin home (US-34), through the real routes with the API mocked at fetch: whoever holds
// dashboard.read sees the dashboard, and an instructor's home stays as it was.

const admin: Me = {
  id: 'admin-1',
  name: 'Mohamed',
  email: 'admin@test.local',
  phone: null,
  roles: ['Admin'],
  permissions: ['dashboard.read:any', 'sessions.read:any'],
  mustChangePassword: false,
  academy: { id: 'a1', name: 'KidzzyCoders', timezone: 'Africa/Cairo' },
};
const instructorUser: Me = {
  ...admin,
  id: 'ana-id',
  roles: ['Instructor'],
  permissions: ['sessions.read:own'],
};

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
const problem = (status: number, code: string) =>
  json(status, { type: 'about:blank', title: 'Error', status, code });

const dashboard: Dashboard = {
  counts: { sessionsToday: 3, dueCycles: 7, cancelledThisWeek: 2, unmarked: 1 },
  todaySessions: [
    {
      id: 's1',
      group: { id: 'g1', name: 'Scratch A' },
      instructorId: 'i1',
      instructorName: 'Ana',
      scheduledAt: '2026-11-11T15:00:00.000Z',
      durationMin: 60,
      status: 'scheduled',
      sessionNumber: null,
      isMakeup: false,
      compensatesSessionId: null,
      cancelReason: null,
      topic: null,
      actualStartedAt: null,
      actualEndedAt: null,
      actualDurationMin: null,
    },
  ],
  recentHeld: [
    {
      sessionId: 'h1',
      scheduledAt: '2026-11-10T15:00:00.000Z',
      group: { id: 'g2', name: 'Python B' },
      instructor: { id: 'i2', name: 'Omar' },
      topic: 'Loops',
      attendance: { present: 4, enrolled: 5 },
      actualDurationMin: 65,
    },
  ],
  dueCycles: {
    students: [
      {
        id: 'c1',
        payeeId: 'st1',
        payeeName: 'Layla',
        cycleNumber: 2,
        amount: '900.00',
        dueAt: '2026-11-01T10:00:00.000Z',
        group: null,
      },
    ],
    instructors: [
      {
        id: 'c2',
        payeeId: 'i1',
        payeeName: 'Ana',
        cycleNumber: 1,
        amount: '1500.00',
        dueAt: '2026-11-02T10:00:00.000Z',
        group: { id: 'g1', name: 'Scratch A' },
      },
    ],
  },
};

let fetchMock: MockInstance<typeof fetch>;
let paths: string[];

function api(me: Me, dashboardResponse: () => Response = () => json(200, dashboard)) {
  fetchMock.mockImplementation((input) => {
    const path = new URL(String(input), 'http://localhost').pathname.replace('/api/v1', '');
    paths.push(path);
    if (path === '/auth/me') return Promise.resolve(json(200, me));
    if (path === '/dashboard') return Promise.resolve(dashboardResponse());
    if (path === '/sessions')
      return Promise.resolve(json(200, { data: [], meta: { page: 1, pageSize: 20, total: 0 } }));
    return Promise.resolve(problem(404, 'NOT_FOUND'));
  });
}

function renderHome() {
  const router = createMemoryRouter(routes, { initialEntries: ['/'] });
  render(
    <AppProviders>
      <RouterProvider router={router} />
    </AppProviders>,
  );
}

beforeEach(() => {
  paths = [];
  fetchMock = vi.spyOn(globalThis, 'fetch');
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe('Home for the admin', () => {
  it('shows the counts, today, the last held sessions and both due lists, each row a link', async () => {
    api(admin);
    renderHome();

    expect(await screen.findByText('حصص النهارده')).toBeInTheDocument();
    const kpi = (label: string) => screen.getByText(label).parentElement?.textContent;
    expect(kpi('حصص النهارده')).toContain('3');
    expect(kpi('دفعات مستحقة')).toContain('7');
    expect(kpi('حصص اتلغت الأسبوع ده')).toContain('2');
    expect(kpi('حصص لسه ما اتسجلتش')).toContain('1');

    const today = screen.getByRole('link', { name: /Scratch A.*مجدولة/ });
    expect(today).toHaveAttribute('href', '/sessions/s1');
    expect(within(today).getByText('Ana')).toBeInTheDocument();
    expect(within(today).getByText('مجدولة')).toBeInTheDocument();

    const held = screen.getByRole('link', { name: /Python B/ });
    expect(held).toHaveAttribute('href', '/sessions/h1');
    expect(within(held).getByText(/Omar - Loops/)).toBeInTheDocument();
    expect(within(held).getByText('حضر 4 من 5')).toBeInTheDocument();

    const student = screen.getByRole('link', { name: /Layla/ });
    expect(student).toHaveAttribute('href', '/students/st1');
    expect(within(student).getByText(/900\.00/)).toBeInTheDocument();
    const instructor = screen.getByRole('link', { name: /دورة 1/ });
    expect(instructor).toHaveAttribute('href', '/instructors/i1');
    expect(within(instructor).getByText(/Scratch A - دورة 1/)).toBeInTheDocument();
  });

  it("shows today's sessions once: the plain list is not rendered beside the dashboard", async () => {
    api(admin);
    renderHome();
    await screen.findByText('حصص النهارده');
    expect(screen.getAllByText('سيشنات النهارده')).toHaveLength(1);
    expect(paths).toContain('/dashboard');
  });

  it('shows the error with a retry when the dashboard fails', async () => {
    api(admin, () => problem(403, 'FORBIDDEN'));
    renderHome();
    expect(await screen.findByRole('button', { name: 'جرب تاني' })).toBeInTheDocument();
  });
});

describe('Home for an instructor', () => {
  it('keeps the old home: today sessions list, and no dashboard request', async () => {
    api(instructorUser);
    renderHome();
    expect(await screen.findByText('سيشنات النهارده')).toBeInTheDocument();
    expect(await screen.findByText('مفيش حصص النهارده')).toBeInTheDocument();
    expect(screen.queryByText('حصص النهارده')).not.toBeInTheDocument();
    expect(paths).not.toContain('/dashboard');
  });
});
