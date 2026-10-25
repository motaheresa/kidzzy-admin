import type { Me, Page, Session } from '@kidzzy/shared';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
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
  permissions: ['sessions.read:any', 'sessions.update:any', 'groups.read:any'],
  mustChangePassword: false,
  academy: { id: 'a1', name: 'KidzzyCoders', timezone: 'Africa/Cairo' },
};
const instructorUser: Me = {
  ...admin,
  id: 'inst-1',
  roles: ['Instructor'],
  permissions: ['sessions.read:own', 'sessions.update:own', 'groups.read:own'],
};
const readOnlyAdmin: Me = {
  ...admin,
  permissions: ['sessions.read:any', 'groups.read:any'],
};
const noSessions: Me = { ...admin, permissions: ['groups.read:any'] };

const session: Session = {
  id: '8a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d',
  group: { id: '3c1d2e4f-5a6b-4c7d-8e9f-0a1b2c3d4e5f', name: 'جروب A' },
  instructorId: 'inst-1',
  instructorName: 'Ana',
  scheduledAt: '2026-10-22T14:00:00.000Z',
  durationMin: 60,
  status: 'scheduled',
  sessionNumber: null,
  isMakeup: false,
  compensatesSessionId: null,
  cancelReason: null,
};

const startedSession: Session = { ...session, scheduledAt: '2026-10-22T09:00:00.000Z' };
const heldSession: Session = { ...startedSession, status: 'held', sessionNumber: 1 };

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
let calls: { method: string; url: URL; body: unknown }[];

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

function sessionCalls() {
  return calls.filter((call) => call.url.pathname.endsWith('/sessions'));
}

function groupData() {
  return {
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
  };
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
      [`GET ${groupPath}`]: () => json(200, groupData()),
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

  it('shows Mark Held on an eligible row and refreshes its status and number after confirmation', async () => {
    let held = false;
    let groupFetches = 0;
    api(admin, {
      'GET /sessions': () => json(200, page([held ? heldSession : startedSession])),
      [`GET ${groupPath}`]: () => {
        groupFetches += 1;
        return json(200, groupData());
      },
      [`GET ${groupPath}/enrollments`]: () => json(200, { data: [] }),
      [`POST /sessions/${session.id}/held`]: () => {
        held = true;
        return json(200, { ...heldSession, cyclesUpdated: [] });
      },
    });
    renderAt(groupPath);

    const markButton = await screen.findByRole('button', { name: /سجّل حصة جروب A/ });
    await userEvent.setup().click(markButton);
    await userEvent.setup().click(await screen.findByRole('button', { name: 'ايوه، سجّلها' }));

    await waitFor(() =>
      expect(
        screen
          .getAllByText('اتعملت')
          .some((element) => element.getAttribute('data-slot') === 'badge'),
      ).toBe(true),
    );
    expect(await screen.findByText('1')).toBeInTheDocument();
    await waitFor(() => expect(groupFetches).toBeGreaterThan(1));
  });

  it('does not show Mark Held when the caller lacks sessions.update', async () => {
    api(readOnlyAdmin, {
      'GET /sessions': () => json(200, page([startedSession])),
      [`GET ${groupPath}`]: () => json(200, groupData()),
      [`GET ${groupPath}/enrollments`]: () => json(200, { data: [] }),
    });
    renderAt(groupPath);

    await screen.findByRole('link', { name: /22 أكتوبر 2026/ });
    expect(screen.queryByRole('button', { name: /سجّل حصة جروب A/ })).not.toBeInTheDocument();
  });

  it('does not show Mark Held to scope own when the session belongs to another instructor', async () => {
    const anotherInstructorSession = { ...startedSession, instructorId: 'former-instructor' };
    api(instructorUser, {
      'GET /sessions': () => json(200, page([anotherInstructorSession])),
      [`GET ${groupPath}`]: () => json(200, groupData()),
      [`GET ${groupPath}/enrollments`]: () => json(200, { data: [] }),
    });
    renderAt(groupPath);

    await screen.findByRole('link', { name: /22 أكتوبر 2026/ });
    expect(screen.queryByRole('button', { name: /سجّل حصة جروب A/ })).not.toBeInTheDocument();
  });
});

describe('session details', () => {
  it('shows the session and hides Mark Held while it has not started', async () => {
    api(admin, { [`GET /sessions/${session.id}`]: () => json(200, session) });
    renderAt(`/sessions/${session.id}`);
    expect(await screen.findByRole('heading', { name: 'جروب A' })).toBeInTheDocument();
    expect(screen.getByText('مجدولة')).toBeInTheDocument();
    expect(screen.getByText('60 دقيقة')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'ارجع للجروب' })).toHaveAttribute(
      'href',
      `/groups/${session.group.id}`,
    );
    expect(screen.queryByRole('button', { name: /سجّل حصة جروب A/ })).not.toBeInTheDocument();
  });

  it('does not show Mark Held for a non-Scheduled session', async () => {
    api(admin, {
      [`GET /sessions/${session.id}`]: () =>
        json(200, { ...heldSession, scheduledAt: '2026-10-21T09:00:00.000Z' }),
    });
    renderAt(`/sessions/${session.id}`);

    await screen.findByRole('heading', { name: 'جروب A' });
    expect(screen.queryByRole('button', { name: /سجّل حصة جروب A/ })).not.toBeInTheDocument();
  });

  it.each([
    ['SESSION_NOT_SCHEDULED', 'الحصة دي مش في حالة مجدولة'],
    ['SESSION_NOT_STARTED', 'ميعاد الحصة لسه مجاش'],
    [
      'SESSION_OUT_OF_ORDER',
      'فيه حصة أقدم لسه مجدولة، أو الحصة دي قبل حصة اتسجلت بالفعل. افتح الجروب وفلتر «مجدولة». لو الحصة مش بتاعتك، الأدمن هو اللي يسجّلها.',
    ],
  ])('shows the Arabic message when marking Held returns %s', async (code, message) => {
    api(admin, {
      [`GET /sessions/${session.id}`]: () => json(200, startedSession),
      [`POST /sessions/${session.id}/held`]: () => problem(409, code),
    });
    renderAt(`/sessions/${session.id}`);

    await userEvent.setup().click(await screen.findByRole('button', { name: /سجّل حصة جروب A/ }));
    await userEvent.setup().click(await screen.findByRole('button', { name: 'ايوه، سجّلها' }));
    expect(await screen.findByText(message)).toBeInTheDocument();
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

describe('cancelling a session', () => {
  const detailPath = `/sessions/${session.id}`;
  const cancelledSession: Session = {
    ...session,
    status: 'cancelled',
    cancelReason: 'Instructor ill',
  };
  const openDialog = async () => {
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: /الغي حصة جروب A/ }));
    return user;
  };

  it('asks for a reason, sends it trimmed, and shows the session as cancelled', async () => {
    api(admin, {
      [`GET ${detailPath}`]: () => json(200, session),
      [`POST ${detailPath}/cancel`]: () => json(200, cancelledSession),
    });
    renderAt(detailPath);

    const user = await openDialog();
    await user.type(screen.getByLabelText(/السبب/), '  Instructor ill  ');
    await user.click(screen.getByRole('button', { name: 'ايوه، الغيها' }));

    expect(await screen.findByText('اتلغت')).toBeInTheDocument();
    expect(calls.find((call) => call.method === 'POST')?.body).toEqual({
      reason: 'Instructor ill',
    });
    expect(screen.queryByRole('button', { name: /الغي حصة جروب A/ })).not.toBeInTheDocument();
  });

  it('does not send a blank reason', async () => {
    api(admin, { [`GET ${detailPath}`]: () => json(200, session) });
    renderAt(detailPath);

    const user = await openDialog();
    await user.type(screen.getByLabelText(/السبب/), '   ');
    await user.click(screen.getByRole('button', { name: 'ايوه، الغيها' }));

    expect(await screen.findByText('اكتب سبب الالغاء')).toBeInTheDocument();
    expect(calls.some((call) => call.method === 'POST')).toBe(false);
  });

  it('shows the reason message when the API refuses the reason', async () => {
    api(admin, {
      [`GET ${detailPath}`]: () => json(200, session),
      [`POST ${detailPath}/cancel`]: () =>
        json(400, {
          type: 'about:blank',
          title: 'Error',
          status: 400,
          code: 'VALIDATION_FAILED',
          errors: [{ field: 'reason', message: 'reason should not be empty' }],
        }),
    });
    renderAt(detailPath);

    const user = await openDialog();
    await user.type(screen.getByLabelText(/السبب/), 'x');
    await user.click(screen.getByRole('button', { name: 'ايوه، الغيها' }));

    expect(await screen.findByText('اكتب سبب الالغاء، 500 حرف على الاكتر')).toBeInTheDocument();
  });

  it('shows the Arabic message when the session is no longer scheduled', async () => {
    api(admin, {
      [`GET ${detailPath}`]: () => json(200, session),
      [`POST ${detailPath}/cancel`]: () => problem(409, 'SESSION_NOT_SCHEDULED'),
    });
    renderAt(detailPath);

    const user = await openDialog();
    await user.type(screen.getByLabelText(/السبب/), 'Holiday');
    await user.click(screen.getByRole('button', { name: 'ايوه، الغيها' }));

    expect(await screen.findByText('الحصة دي مش في حالة مجدولة')).toBeInTheDocument();
  });

  it('is offered on a session that has not started, and on a today row', async () => {
    api(instructorUser, { 'GET /sessions': () => json(200, page([session])) });
    renderAt('/');

    expect(await screen.findByRole('button', { name: /الغي حصة جروب A/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /سجّل حصة جروب A/ })).not.toBeInTheDocument();
  });

  it.each([
    ['a Held session', admin, { ...heldSession }],
    ['a Cancelled session', admin, cancelledSession],
    ['a user without sessions.update', readOnlyAdmin, session],
    [
      'scope own on another instructor’s session',
      instructorUser,
      {
        ...session,
        instructorId: 'former-instructor',
      },
    ],
  ])('hides the action for %s', async (_label, me, shown) => {
    api(me, { [`GET ${detailPath}`]: () => json(200, shown) });
    renderAt(detailPath);

    await screen.findByRole('heading', { name: 'جروب A' });
    expect(screen.queryByRole('button', { name: /الغي حصة جروب A/ })).not.toBeInTheDocument();
  });
});

describe('attendance on the session details', () => {
  const detailPath = `/sessions/${session.id}`;
  const attendancePath = `${detailPath}/attendance`;
  const recorder: Me = {
    ...admin,
    permissions: [...admin.permissions, 'attendance.read:any', 'attendance.record:any'],
  };
  const reader: Me = { ...admin, permissions: [...admin.permissions, 'attendance.read:any'] };
  const ownInstructor: Me = {
    ...instructorUser,
    permissions: [...instructorUser.permissions, 'attendance.read:own', 'attendance.record:own'],
  };
  const line = (studentId: string, studentName: string, status: 'present' | 'absent' | null) => ({
    studentId,
    studentName,
    status,
    performanceRating: null,
    homeworkRating: null,
  });
  const empty = {
    sessionId: session.id,
    records: [line('s1', 'Amal', null), line('s2', 'Mona', null)],
  };
  const groupOf = (name: string) => screen.getByRole('radiogroup', { name: 'حضور ' + name });

  it('stays hidden for a session that is not Held, without asking the API', async () => {
    api(recorder, { [`GET ${detailPath}`]: () => json(200, session) });
    renderAt(detailPath);

    await screen.findByRole('heading', { name: 'جروب A' });
    expect(screen.queryByText('الحضور')).not.toBeInTheDocument();
    expect(calls.some((call) => call.url.pathname.endsWith('/attendance'))).toBe(false);
  });

  it('saves only what changed and says it was saved', async () => {
    const saved = {
      sessionId: session.id,
      records: [line('s1', 'Amal', 'present'), line('s2', 'Mona', null)],
    };
    api(recorder, {
      [`GET ${detailPath}`]: () => json(200, heldSession),
      [`GET ${attendancePath}`]: () => json(200, empty),
      [`PUT ${attendancePath}`]: () => json(200, saved),
    });
    renderAt(detailPath);

    const user = userEvent.setup();
    const save = await screen.findByRole('button', { name: 'احفظ الحضور' });
    expect(save).toBeDisabled();
    await user.click(
      within(await waitFor(() => groupOf('Amal'))).getByRole('radio', { name: 'حاضر' }),
    );
    expect(save).toBeEnabled();
    await user.click(save);

    expect(await screen.findByText('اتحفظ')).toBeInTheDocument();
    expect(calls.find((call) => call.method === 'PUT')?.body).toEqual({
      records: [
        { studentId: 's1', status: 'present', performanceRating: null, homeworkRating: null },
      ],
    });
    expect(screen.getByRole('button', { name: 'احفظ الحضور' })).toBeDisabled();
  });

  it('is read only for someone who may read but not record', async () => {
    api(reader, {
      [`GET ${detailPath}`]: () => json(200, heldSession),
      [`GET ${attendancePath}`]: () =>
        json(200, {
          sessionId: session.id,
          records: [line('s1', 'Amal', 'present'), line('s2', 'Mona', null)],
        }),
    });
    renderAt(detailPath);

    expect(await screen.findByText('Amal')).toBeInTheDocument();
    expect(screen.getByText('حاضر')).toBeInTheDocument();
    expect(screen.getByText('لسه ما اتسجلش')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'احفظ الحضور' })).not.toBeInTheDocument();
    expect(screen.queryByRole('radio')).not.toBeInTheDocument();
  });

  it('is read only for scope own on another instructor’s session', async () => {
    api(ownInstructor, {
      [`GET ${detailPath}`]: () => json(200, { ...heldSession, instructorId: 'former-instructor' }),
      [`GET ${attendancePath}`]: () => json(200, empty),
    });
    renderAt(detailPath);

    expect(await screen.findByText('Amal')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'احفظ الحضور' })).not.toBeInTheDocument();
  });

  it('is editable for scope own on the instructor’s own session', async () => {
    api(ownInstructor, {
      [`GET ${detailPath}`]: () => json(200, heldSession),
      [`GET ${attendancePath}`]: () => json(200, empty),
    });
    renderAt(detailPath);

    expect(await screen.findByRole('button', { name: 'احفظ الحضور' })).toBeInTheDocument();
  });

  it('stays hidden for someone without attendance.read', async () => {
    api(admin, { [`GET ${detailPath}`]: () => json(200, heldSession) });
    renderAt(detailPath);

    await screen.findByRole('heading', { name: 'جروب A' });
    expect(screen.queryByText('الحضور')).not.toBeInTheDocument();
    expect(calls.some((call) => call.url.pathname.endsWith('/attendance'))).toBe(false);
  });

  it.each([
    [409, 'SESSION_NOT_HELD', 'الحصة دي لسه ما اتعملتش'],
    [422, 'STUDENT_NOT_IN_SESSION', 'الطالب ده مش من طلاب الحصة دي'],
  ])('shows the Arabic message for %s %s', async (status, code, message) => {
    api(recorder, {
      [`GET ${detailPath}`]: () => json(200, heldSession),
      [`GET ${attendancePath}`]: () => json(200, empty),
      [`PUT ${attendancePath}`]: () => problem(status, code),
    });
    renderAt(detailPath);

    const user = userEvent.setup();
    await user.click(
      within(await waitFor(() => groupOf('Mona'))).getByRole('radio', { name: 'غايب' }),
    );
    await user.click(screen.getByRole('button', { name: 'احفظ الحضور' }));

    expect(await screen.findByText(message)).toBeInTheDocument();
  });

  describe('ratings', () => {
    const rated = (performanceRating: number | null, homeworkRating: number | null) => ({
      sessionId: session.id,
      records: [
        {
          studentId: 's1',
          studentName: 'Amal',
          status: 'present' as const,
          performanceRating,
          homeworkRating,
        },
      ],
    });
    const star = (group: string, count: number) =>
      within(screen.getByRole('radiogroup', { name: group + ' Amal' })).getByRole('radio', {
        name: count + ' من 5',
      });
    const open = async (data: unknown, me: Me = recorder) => {
      api(me, {
        [`GET ${detailPath}`]: () => json(200, heldSession),
        [`GET ${attendancePath}`]: () => json(200, data),
        [`PUT ${attendancePath}`]: () => json(200, data),
      });
      renderAt(detailPath);
      await screen.findByRole('button', { name: 'احفظ الحضور' });
      return userEvent.setup();
    };
    const sent = () => calls.find((call) => call.method === 'PUT')?.body;

    it('sets a performance rating, clears it by pressing it again, and sends the new one', async () => {
      const user = await open(rated(null, null));

      await user.click(star('تقييم الأداء', 4));
      expect(star('تقييم الأداء', 4)).toBeChecked();
      await user.click(star('تقييم الأداء', 4));
      expect(star('تقييم الأداء', 4)).not.toBeChecked();
      await user.click(star('تقييم الأداء', 3));
      await user.click(screen.getByRole('button', { name: 'احفظ الحضور' }));

      await waitFor(() => expect(sent()).toBeDefined());
      expect(sent()).toEqual({
        records: [
          { studentId: 's1', status: 'present', performanceRating: 3, homeworkRating: null },
        ],
      });
    });

    it('sends null for "no homework" and keeps the other rating', async () => {
      const user = await open(rated(5, 3));

      expect(star('تقييم الواجب', 3)).toBeChecked();
      await user.click(
        within(screen.getByRole('radiogroup', { name: 'تقييم الواجب Amal' })).getByRole('radio', {
          name: 'مفيش واجب',
        }),
      );
      await user.click(screen.getByRole('button', { name: 'احفظ الحضور' }));

      await waitFor(() => expect(sent()).toBeDefined());
      expect(sent()).toEqual({
        records: [
          { studentId: 's1', status: 'present', performanceRating: 5, homeworkRating: null },
        ],
      });
    });

    it('shows "no homework" as chosen when nothing was given', async () => {
      await open(rated(null, null));

      expect(
        within(screen.getByRole('radiogroup', { name: 'تقييم الواجب Amal' })).getByRole('radio', {
          name: 'مفيش واجب',
        }),
      ).toBeChecked();
    });

    it('hides the ratings of an absent student and clears them before saving', async () => {
      const user = await open(rated(5, 4));

      await user.click(
        within(screen.getByRole('radiogroup', { name: 'حضور Amal' })).getByRole('radio', {
          name: 'غايب',
        }),
      );
      expect(
        screen.queryByRole('radiogroup', { name: 'تقييم الأداء Amal' }),
      ).not.toBeInTheDocument();
      expect(
        screen.queryByRole('radiogroup', { name: 'تقييم الواجب Amal' }),
      ).not.toBeInTheDocument();
      await user.click(screen.getByRole('button', { name: 'احفظ الحضور' }));

      await waitFor(() => expect(sent()).toBeDefined());
      expect(sent()).toEqual({
        records: [
          { studentId: 's1', status: 'absent', performanceRating: null, homeworkRating: null },
        ],
      });
    });

    it('works from the keyboard in right to left order', async () => {
      const user = await open(rated(null, null));

      expect(screen.getByRole('radiogroup', { name: 'تقييم الأداء Amal' })).toHaveAttribute(
        'dir',
        'rtl',
      );
      star('تقييم الأداء', 1).focus();
      // Right to left: the left arrow goes to the next star.
      await user.keyboard('{ArrowLeft}');
      expect(star('تقييم الأداء', 2)).toHaveFocus();
      await user.keyboard('{ArrowRight}');
      expect(star('تقييم الأداء', 1)).toHaveFocus();
      await user.keyboard('{ArrowLeft}{ArrowLeft}{ArrowLeft}');
      expect(star('تقييم الأداء', 4)).toHaveFocus();
      await user.keyboard(' ');
      expect(star('تقييم الأداء', 4)).toBeChecked();
    });

    it('shows the ratings read only to someone who may not record', async () => {
      api(reader, {
        [`GET ${detailPath}`]: () => json(200, heldSession),
        [`GET ${attendancePath}`]: () => json(200, rated(4, null)),
      });
      renderAt(detailPath);

      expect(await screen.findByText(/الأداء:/)).toHaveTextContent('الأداء: 4 من 5');
      expect(screen.getByText(/الواجب:/)).toHaveTextContent('الواجب: مفيش واجب');
      expect(
        screen.queryByRole('radiogroup', { name: 'تقييم الأداء Amal' }),
      ).not.toBeInTheDocument();
    });
  });
});

describe('sessions that need marking (SCRUM-73)', () => {
  const overdue: Session = {
    ...session,
    id: '1b2c3d4e-5f6a-4b7c-8d9e-0f1a2b3c4d5e',
    scheduledAt: '2026-10-21T14:00:00.000Z',
  };
  const needsMarkingCalls = () =>
    calls.filter((c) => c.method === 'GET' && c.url.searchParams.get('status') === 'scheduled');

  /** Today's list is empty; the needs-marking list (status=scheduled) answers from `overdueNow`. */
  function home(me: Me, overdueNow: () => Session[], extra: Record<string, Handler> = {}) {
    api(me, {
      'GET /sessions': (url) =>
        json(200, page(url.searchParams.get('status') === 'scheduled' ? overdueNow() : [])),
      ...extra,
    });
  }

  it('shows yesterday’s Scheduled session above today’s, with who taught it, asking for what started before now', async () => {
    home(admin, () => [overdue]);
    renderAt('/');

    expect(await screen.findByText(/سيشنات محتاجة تتسجل/)).toBeInTheDocument();
    const row = (await screen.findByRole('link', { name: /جروب A/ })).closest('li') as HTMLElement;
    expect(within(row).getByText(/Ana/)).toBeInTheDocument();
    expect(within(row).getByRole('button', { name: /سجّل حصة جروب A/ })).toBeInTheDocument();
    expect(within(row).getByRole('button', { name: /الغي حصة جروب A/ })).toBeInTheDocument();

    const query = needsMarkingCalls()[0]?.url.searchParams;
    expect(query?.get('status')).toBe('scheduled');
    expect(query?.get('to')).toBe('2026-10-22T10:00:00.000Z');
    expect(query?.has('from')).toBe(false);
  });

  it('leaves the section after Mark Held, and today’s list is read again', async () => {
    let held = false;
    home(admin, () => (held ? [] : [overdue]), {
      [`POST /sessions/${overdue.id}/held`]: () => {
        held = true;
        return json(200, { ...overdue, status: 'held', sessionNumber: 1, cyclesUpdated: [] });
      },
    });
    renderAt('/');
    const user = userEvent.setup();

    await user.click(await screen.findByRole('button', { name: /سجّل حصة جروب A/ }));
    await user.click(await screen.findByRole('button', { name: 'ايوه، سجّلها' }));

    await waitFor(() => expect(screen.queryByText(/سيشنات محتاجة تتسجل/)).not.toBeInTheDocument());
    const todayReads = calls.filter(
      (c) =>
        c.method === 'GET' &&
        c.url.pathname.endsWith('/sessions') &&
        !c.url.searchParams.has('status'),
    );
    expect(todayReads.length).toBeGreaterThan(1);
  });

  it('leaves the section after Cancel', async () => {
    let cancelled = false;
    home(admin, () => (cancelled ? [] : [overdue]), {
      [`POST /sessions/${overdue.id}/cancel`]: () => {
        cancelled = true;
        return json(200, { ...overdue, status: 'cancelled', cancelReason: 'Holiday' });
      },
    });
    renderAt('/');
    const user = userEvent.setup();

    await user.click(await screen.findByRole('button', { name: /الغي حصة جروب A/ }));
    await user.type(await screen.findByLabelText('السبب'), 'Holiday');
    await user.click(screen.getByRole('button', { name: 'ايوه، الغيها' }));

    await waitFor(() => expect(screen.queryByText(/سيشنات محتاجة تتسجل/)).not.toBeInTheDocument());
  });

  it('shows nothing when no session needs marking', async () => {
    home(admin, () => []);
    renderAt('/');

    await waitFor(() => expect(needsMarkingCalls().length).toBeGreaterThan(0));
    await screen.findByText('مفيش حصص النهارده');
    expect(screen.queryByText(/سيشنات محتاجة تتسجل/)).not.toBeInTheDocument();
  });

  it('shows an instructor their own, with the actions, and not the instructor’s name', async () => {
    home(instructorUser, () => [overdue]);
    renderAt('/');

    const row = (await screen.findByRole('link', { name: /جروب A/ })).closest('li') as HTMLElement;
    expect(within(row).getByRole('button', { name: /سجّل حصة جروب A/ })).toBeInTheDocument();
    expect(within(row).queryByText(/Ana/)).not.toBeInTheDocument();
  });

  it('shows an instructor a session they cannot write without any action', async () => {
    const theirs: Session = {
      ...overdue,
      instructorId: 'former-instructor',
      instructorName: 'Former',
    };
    home(instructorUser, () => [theirs]);
    renderAt('/');

    const row = (await screen.findByRole('link', { name: /جروب A/ })).closest('li') as HTMLElement;
    expect(within(row).queryByRole('button')).not.toBeInTheDocument();
  });

  it('shows the Arabic message when the list cannot be read', async () => {
    api(admin, {
      'GET /sessions': (url) =>
        url.searchParams.get('status') === 'scheduled'
          ? problem(500, 'INTERNAL_ERROR')
          : json(200, page([])),
    });
    renderAt('/');

    expect(
      await screen.findByText('حصلت مشكلة في السيرفر، جرب تاني', {}, { timeout: 5000 }),
    ).toBeInTheDocument();
  });
});

describe('undoing a Held session (US-17)', () => {
  const undoer: Me = { ...admin, permissions: [...admin.permissions, 'sessions.undo_held:any'] };
  const heldNumbered: Session = { ...heldSession, sessionNumber: 3 };
  const detailPath = `/sessions/${session.id}`;
  const undoPath = `POST /sessions/${session.id}/undo-held`;
  const undoPosts = () =>
    calls.filter((c) => c.method === 'POST' && c.url.pathname.endsWith('/undo-held'));
  const confirm = async () => {
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'رجّع الحصة لمجدولة' }));
    await user.click(
      within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'ايوه، رجّعها' }),
    );
  };

  it('is offered on a Held session to whoever holds sessions.undo_held', async () => {
    api(undoer, { [`GET ${detailPath}`]: () => json(200, heldNumbered) });
    renderAt(detailPath);

    expect(await screen.findByRole('button', { name: 'رجّع الحصة لمجدولة' })).toBeInTheDocument();
  });

  it.each([
    ['a Scheduled session', undoer, session],
    ['a Cancelled session', undoer, { ...session, status: 'cancelled', cancelReason: 'x' }],
    ['someone without the permission', admin, heldNumbered],
    ['an instructor', instructorUser, heldNumbered],
  ])('is not offered for %s', async (_label, me, shown) => {
    api(me, { [`GET ${detailPath}`]: () => json(200, shown) });
    renderAt(detailPath);

    await screen.findByRole('heading', { name: 'جروب A' });
    expect(screen.queryByRole('button', { name: 'رجّع الحصة لمجدولة' })).not.toBeInTheDocument();
  });

  it('says what follows, asks, then shows the session as Scheduled with no number', async () => {
    let undone = false;
    api(undoer, {
      [`GET ${detailPath}`]: () =>
        json(
          200,
          undone
            ? { ...session, ...startedSession, status: 'scheduled', sessionNumber: null }
            : heldNumbered,
        ),
      [undoPath]: () => {
        undone = true;
        return json(200, { ...startedSession, status: 'scheduled', sessionNumber: null });
      },
    });
    renderAt(detailPath);
    const user = userEvent.setup();

    await user.click(await screen.findByRole('button', { name: 'رجّع الحصة لمجدولة' }));
    const dialog = within(await screen.findByRole('alertdialog'));
    expect(dialog.getByText(/حضورها وتقييماتها هيتمسحوا/)).toBeInTheDocument();
    expect(undoPosts()).toHaveLength(0);
    await user.click(dialog.getByRole('button', { name: 'ايوه، رجّعها' }));

    await waitFor(() => expect(undoPosts()).toHaveLength(1));
    expect(await screen.findByText('مجدولة')).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument());
    expect(screen.queryByRole('button', { name: 'رجّع الحصة لمجدولة' })).not.toBeInTheDocument();
  });

  it.each([
    [
      'SESSION_IN_LATER_CYCLE',
      'الحصة دي محسوبة في دورة وبعدها دورة بدأت تحسب حصص. رجّع الحصص الاحدث الاول',
    ],
    ['CYCLE_ALREADY_PAID', 'الدورة دي اتدفعت بالفعل'],
    ['SESSION_NOT_HELD', 'الحصة دي لسه ما اتعملتش'],
  ])('shows %s in the dialog and keeps the session Held', async (code, message) => {
    api(undoer, {
      [`GET ${detailPath}`]: () => json(200, heldNumbered),
      [undoPath]: () => problem(409, code),
    });
    renderAt(detailPath);

    await confirm();

    expect(await screen.findByText(message)).toBeInTheDocument();
    expect(screen.getByRole('alertdialog')).toBeInTheDocument();
    expect(screen.getByText('اتعملت')).toBeInTheDocument();
  });
});

describe('changing the time of a session (US-15)', () => {
  const detailPath = `/sessions/${session.id}`;
  const overdue: Session = {
    ...session,
    id: '1b2c3d4e-5f6a-4b7c-8d9e-0f1a2b3c4d5e',
    scheduledAt: '2026-10-21T14:00:00.000Z',
  };
  const button = /غيّر ميعاد حصة جروب A/;
  const posts = () => calls.filter((c) => c.method === 'POST');
  const fill = (date: string, time: string) => {
    fireEvent.change(screen.getByLabelText('التاريخ'), { target: { value: date } });
    fireEvent.change(screen.getByLabelText('الساعة'), { target: { value: time } });
  };

  it('is offered on a Scheduled session only, to whoever may update it', async () => {
    api(admin, { [`GET ${detailPath}`]: () => json(200, session) });
    renderAt(detailPath);
    expect(await screen.findByRole('button', { name: button })).toBeInTheDocument();
  });

  it.each([
    ['a Held session', heldSession],
    ['a Cancelled session', { ...session, status: 'cancelled' as const, cancelReason: 'x' }],
  ])('is not offered on %s', async (_name, other) => {
    api(admin, { [`GET ${detailPath}`]: () => json(200, other) });
    renderAt(detailPath);
    await screen.findByText(/جروب A/);
    expect(screen.queryByRole('button', { name: button })).not.toBeInTheDocument();
  });

  it('is not offered without sessions.update', async () => {
    api(readOnlyAdmin, { [`GET ${detailPath}`]: () => json(200, session) });
    renderAt(detailPath);
    await screen.findByText(/جروب A/);
    expect(screen.queryByRole('button', { name: button })).not.toBeInTheDocument();
  });

  it('starts from the academy-local date and time, and sends the UTC instant', async () => {
    const moved: Session = { ...session, scheduledAt: '2026-10-30T15:00:00.000Z' };
    api(admin, {
      [`GET ${detailPath}`]: () => json(200, session),
      [`POST ${detailPath}/reschedule`]: () => json(200, moved),
    });
    renderAt(detailPath);
    const user = userEvent.setup();

    await user.click(await screen.findByRole('button', { name: button }));
    // 14:00 UTC on the 22nd is 17:00 in Cairo (UTC+3).
    expect(screen.getByLabelText('التاريخ')).toHaveValue('2026-10-22');
    expect(screen.getByLabelText('الساعة')).toHaveValue('17:00');
    // 17:00 on 2026-10-30 is after Egypt leaves DST (UTC+2): 15:00 UTC, not 14:00.
    fill('2026-10-30', '17:00');
    await user.click(screen.getByRole('button', { name: 'غيّر الميعاد' }));

    await waitFor(() => expect(posts()).toHaveLength(1));
    expect(posts()[0]?.body).toEqual({ scheduledAt: '2026-10-30T15:00:00.000Z' });
    // The detail shows the new time and the dialog is closed.
    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument());
    expect(await screen.findByText(/30 أكتوبر 2026/)).toBeInTheDocument();
  });

  it('uses the offset in force the day before the DST change', async () => {
    api(admin, {
      [`GET ${detailPath}`]: () => json(200, session),
      [`POST ${detailPath}/reschedule`]: () => json(200, session),
    });
    renderAt(detailPath);
    const user = userEvent.setup();

    await user.click(await screen.findByRole('button', { name: button }));
    fill('2026-10-29', '17:00');
    await user.click(screen.getByRole('button', { name: 'غيّر الميعاد' }));

    await waitFor(() => expect(posts()).toHaveLength(1));
    expect(posts()[0]?.body).toEqual({ scheduledAt: '2026-10-29T14:00:00.000Z' });
  });

  it('sends nothing while the date or the time is empty', async () => {
    api(admin, { [`GET ${detailPath}`]: () => json(200, session) });
    renderAt(detailPath);
    const user = userEvent.setup();

    await user.click(await screen.findByRole('button', { name: button }));
    fill('', '17:00');
    await user.click(screen.getByRole('button', { name: 'غيّر الميعاد' }));
    expect(posts()).toHaveLength(0);
  });

  it('shows the Arabic message when the session is no longer Scheduled, and keeps the dialog open', async () => {
    api(admin, {
      [`GET ${detailPath}`]: () => json(200, session),
      [`POST ${detailPath}/reschedule`]: () => problem(409, 'SESSION_NOT_SCHEDULED'),
    });
    renderAt(detailPath);
    const user = userEvent.setup();

    await user.click(await screen.findByRole('button', { name: button }));
    await user.click(screen.getByRole('button', { name: 'غيّر الميعاد' }));

    expect(await screen.findByText('الحصة دي مش في حالة مجدولة')).toBeInTheDocument();
    expect(screen.getByRole('alertdialog')).toBeInTheDocument();
  });

  it('moves a missed session to the future: it leaves “needs marking”', async () => {
    let moved = false;
    api(admin, {
      'GET /sessions': (url) =>
        json(200, page(url.searchParams.get('status') === 'scheduled' && !moved ? [overdue] : [])),
      [`POST /sessions/${overdue.id}/reschedule`]: () => {
        moved = true;
        return json(200, { ...overdue, scheduledAt: '2026-10-25T14:00:00.000Z' });
      },
    });
    renderAt('/');
    const user = userEvent.setup();

    expect(await screen.findByText(/سيشنات محتاجة تتسجل/)).toBeInTheDocument();
    await user.click(await screen.findByRole('button', { name: button }));
    fill('2026-10-25', '17:00');
    await user.click(screen.getByRole('button', { name: 'غيّر الميعاد' }));

    await waitFor(() => expect(screen.queryByText(/سيشنات محتاجة تتسجل/)).not.toBeInTheDocument());
    expect(posts()[0]?.body).toEqual({ scheduledAt: '2026-10-25T14:00:00.000Z' });
  });

  it('moves a session from today to another day: it leaves today’s list', async () => {
    let moved = false;
    api(admin, {
      'GET /sessions': () => json(200, page(moved ? [] : [session])),
      [`POST /sessions/${session.id}/reschedule`]: () => {
        moved = true;
        return json(200, { ...session, scheduledAt: '2026-10-23T14:00:00.000Z' });
      },
    });
    renderAt('/');
    const user = userEvent.setup();

    await user.click(await screen.findByRole('button', { name: button }));
    fill('2026-10-23', '17:00');
    await user.click(screen.getByRole('button', { name: 'غيّر الميعاد' }));

    await waitFor(() =>
      expect(screen.queryByRole('link', { name: /جروب A/ })).not.toBeInTheDocument(),
    );
  });
});

describe('adding a make-up or extra session (US-16)', () => {
  const groupPath = `/groups/${session.group.id}`;
  const button = /ضيف حصة جروب A/;
  const cancelled1: Session = {
    ...session,
    id: 'c1c1c1c1-0000-4000-8000-000000000001',
    scheduledAt: '2026-10-08T14:00:00.000Z',
    status: 'cancelled',
    cancelReason: 'x',
  };
  const cancelled2: Session = {
    ...cancelled1,
    id: 'c2c2c2c2-0000-4000-8000-000000000002',
    scheduledAt: '2026-10-15T14:00:00.000Z',
  };
  const makeupOf1: Session = {
    ...session,
    id: 'a1a1a1a1-0000-4000-8000-000000000003',
    isMakeup: true,
    compensatesSessionId: cancelled1.id,
  };
  const created: Session = {
    ...session,
    id: 'd1d1d1d1-0000-4000-8000-000000000004',
    isMakeup: true,
  };
  const posts = () => calls.filter((c) => c.method === 'POST');
  const fill = (date: string, time: string) => {
    fireEvent.change(screen.getByLabelText('التاريخ'), { target: { value: date } });
    fireEvent.change(screen.getByLabelText('الساعة'), { target: { value: time } });
  };

  function group(over: object = {}, me: Me = admin, extra: Record<string, Handler> = {}) {
    api(me, {
      'GET /sessions': (url) => {
        if (url.searchParams.get('status') === 'cancelled') {
          return json(200, page([cancelled1, cancelled2]));
        }
        if (url.searchParams.get('isMakeup') === 'true') return json(200, page([makeupOf1]));
        return json(200, page([session]));
      },
      [`GET ${groupPath}`]: () =>
        json(200, {
          ...groupData(),
          schedule: [{ weekday: 4, startTime: '17:00', durationMin: 90 }],
          ...over,
        }),
      [`GET ${groupPath}/enrollments`]: () => json(200, { data: [] }),
      ...extra,
    });
  }

  it('is offered to whoever may update sessions, on an active group', async () => {
    group();
    renderAt(groupPath);
    expect(await screen.findByRole('button', { name: button })).toBeInTheDocument();
  });

  it.each([
    ['an inactive group', admin, { isActive: false }],
    ['someone without sessions.update', readOnlyAdmin, {}],
    [
      'scope own on another instructor’s group',
      instructorUser,
      { instructor: { id: 'someone-else', name: 'X' } },
    ],
  ])('is not offered on %s', async (_name, me, over) => {
    group(over, me);
    renderAt(groupPath);
    await screen.findByRole('link', { name: /22 أكتوبر 2026/ });
    expect(screen.queryByRole('button', { name: button })).not.toBeInTheDocument();
  });

  it('is offered to scope own on the group they teach now', async () => {
    group({}, instructorUser);
    renderAt(groupPath);
    expect(await screen.findByRole('button', { name: button })).toBeInTheDocument();
  });

  it('starts from the group’s usual duration and offers only Cancelled sessions without a make-up', async () => {
    group();
    renderAt(groupPath);
    await userEvent.setup().click(await screen.findByRole('button', { name: button }));

    const dialog = within(await screen.findByRole('alertdialog'));
    expect(dialog.getByLabelText(/المدة/)).toHaveValue(90);
    const select = dialog.getByLabelText('بتعوّض عن');
    // The extra option, and the 15th only: the 8th already has a make-up.
    await waitFor(() => expect(within(select).getAllByRole('option')).toHaveLength(2));
    expect(within(select).getByRole('option', { name: /15 أكتوبر 2026/ })).toBeInTheDocument();
    expect(within(select).queryByRole('option', { name: /8 أكتوبر 2026/ })).not.toBeInTheDocument();
  });

  it('adds an extra session: the Cairo time goes as UTC, with no link', async () => {
    group({}, admin, { [`POST ${groupPath}/sessions`]: () => json(201, created) });
    renderAt(groupPath);
    const user = userEvent.setup();

    await user.click(await screen.findByRole('button', { name: button }));
    await screen.findByRole('alertdialog');
    // After Egypt leaves DST (UTC+2): 17:00 on 2026-10-30 is 15:00 UTC.
    fill('2026-10-30', '17:00');
    await user.click(screen.getByRole('button', { name: 'ضيف الحصة' }));

    await waitFor(() => expect(posts()).toHaveLength(1));
    expect(posts()[0]?.body).toEqual({ scheduledAt: '2026-10-30T15:00:00.000Z', durationMin: 90 });
    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument());
  });

  it('adds a make-up with the chosen Cancelled session and a changed duration', async () => {
    group({}, admin, { [`POST ${groupPath}/sessions`]: () => json(201, created) });
    renderAt(groupPath);
    const user = userEvent.setup();

    await user.click(await screen.findByRole('button', { name: button }));
    const dialog = within(await screen.findByRole('alertdialog'));
    fill('2026-10-29', '17:00');
    fireEvent.change(dialog.getByLabelText(/المدة/), { target: { value: '45' } });
    await waitFor(() =>
      expect(within(dialog.getByLabelText('بتعوّض عن')).getAllByRole('option')).toHaveLength(2),
    );
    await user.selectOptions(dialog.getByLabelText('بتعوّض عن'), cancelled2.id);
    await user.click(dialog.getByRole('button', { name: 'ضيف الحصة' }));

    await waitFor(() => expect(posts()).toHaveLength(1));
    expect(posts()[0]?.body).toEqual({
      scheduledAt: '2026-10-29T14:00:00.000Z',
      durationMin: 45,
      compensatesSessionId: cancelled2.id,
    });
  });

  it('sends nothing while the time is empty or the duration is out of range', async () => {
    group();
    renderAt(groupPath);
    const user = userEvent.setup();

    await user.click(await screen.findByRole('button', { name: button }));
    const dialog = within(await screen.findByRole('alertdialog'));
    await user.click(dialog.getByRole('button', { name: 'ضيف الحصة' }));
    fill('2026-10-30', '17:00');
    fireEvent.change(dialog.getByLabelText(/المدة/), { target: { value: '10' } });
    await user.click(dialog.getByRole('button', { name: 'ضيف الحصة' }));
    expect(posts()).toHaveLength(0);
  });

  it('reads the session lists again after adding', async () => {
    group({}, admin, { [`POST ${groupPath}/sessions`]: () => json(201, created) });
    renderAt(groupPath);
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: button }));
    await screen.findByRole('alertdialog');
    const before = sessionCalls().length;
    fill('2026-10-30', '17:00');
    await user.click(screen.getByRole('button', { name: 'ضيف الحصة' }));

    await waitFor(() => expect(sessionCalls().length).toBeGreaterThan(before));
  });

  it.each([
    ['SESSION_NOT_CANCELLED', 409, 'الحصة دي مش ملغية، التعويض بيبقى عن حصة ملغية بس'],
    ['SESSION_ALREADY_COMPENSATED', 409, 'الحصة الملغية دي ليها حصة تعويضية بالفعل'],
    ['COMPENSATES_SESSION_INVALID', 422, 'اختار حصة ملغية من نفس الجروب'],
    ['GROUP_INACTIVE', 409, 'الجروب ده متوقف، اختار جروب شغال'],
  ])('shows %s in the dialog and keeps it open', async (code, status, message) => {
    group({}, admin, { [`POST ${groupPath}/sessions`]: () => problem(status, code) });
    renderAt(groupPath);
    const user = userEvent.setup();

    await user.click(await screen.findByRole('button', { name: button }));
    await screen.findByRole('alertdialog');
    fill('2026-10-30', '17:00');
    await user.click(screen.getByRole('button', { name: 'ضيف الحصة' }));

    expect(await screen.findByText(message)).toBeInTheDocument();
    expect(screen.getByRole('alertdialog')).toBeInTheDocument();
  });

  it('labels a make-up “تعويضية” and an extra session “اضافية”', async () => {
    api(admin, {
      'GET /sessions': () =>
        json(
          200,
          page([
            makeupOf1,
            {
              ...created,
              id: 'e1e1e1e1-0000-4000-8000-000000000005',
              scheduledAt: '2026-10-31T14:00:00.000Z',
            },
          ]),
        ),
      [`GET ${groupPath}`]: () => json(200, groupData()),
      [`GET ${groupPath}/enrollments`]: () => json(200, { data: [] }),
    });
    renderAt(groupPath);

    expect(await screen.findByText('تعويضية')).toBeInTheDocument();
    expect(screen.getByText('اضافية')).toBeInTheDocument();
  });
});
