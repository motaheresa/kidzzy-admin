import type { Me, Session } from '@kidzzy/shared';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest';
import { AppProviders } from './providers';
import { routes } from './router';

// Marking a session Held with its topic and attendance in one request (SCRUM-79), through the
// real routes, with the API mocked at fetch. "Now" is 2026-10-22 13:00 in Cairo.

const NOW = new Date('2026-10-22T10:00:00.000Z');

const admin: Me = {
  id: 'admin-1',
  name: 'Mohamed',
  email: 'admin@test.local',
  phone: null,
  roles: ['Admin'],
  permissions: [
    'sessions.read:any',
    'sessions.update:any',
    'groups.read:any',
    'attendance.read:any',
    'attendance.record:any',
  ],
  mustChangePassword: false,
  academy: { id: 'a1', name: 'KidzzyCoders', timezone: 'Africa/Cairo' },
};

const session: Session = {
  id: '8a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d',
  group: { id: '3c1d2e4f-5a6b-4c7d-8e9f-0a1b2c3d4e5f', name: 'جروب A' },
  instructorId: 'inst-1',
  instructorName: 'Ana',
  scheduledAt: '2026-10-22T09:00:00.000Z',
  durationMin: 60,
  status: 'scheduled',
  sessionNumber: null,
  isMakeup: false,
  compensatesSessionId: null,
  cancelReason: null,
  topic: null,
};
const heldSession: Session = { ...session, status: 'held', sessionNumber: 1, topic: 'Loops' };

const student = (studentId: string, studentName: string, note: string | null = null) => ({
  studentId,
  studentName,
  status: null,
  performanceRating: null,
  homeworkRating: null,
  note,
});
const roster = {
  sessionId: session.id,
  records: [student('s1', 'Amal'), student('s2', 'Mona')],
};

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
const problem = (status: number, code: string) =>
  json(status, { type: 'about:blank', title: 'Error', status, code });

type Handler = (url: URL) => Response | Promise<Response>;
let fetchMock: MockInstance<typeof fetch>;
let calls: { method: string; url: URL; body: unknown }[];

function api(handlers: Record<string, Handler>, me: Me = admin) {
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
}

const detailPath = `/sessions/${session.id}`;
const attendancePath = `${detailPath}/attendance`;
const heldCalls = () =>
  calls.filter((c) => c.method === 'POST' && c.url.pathname.endsWith('/held'));
const groupOf = (name: string) => screen.getByRole('radiogroup', { name: 'حضور ' + name });
const confirmButton = () => screen.getByRole('button', { name: 'ايوه، سجّلها' });

async function openDialog(user: ReturnType<typeof userEvent.setup>) {
  await user.click(await screen.findByRole('button', { name: /سجّل حصة جروب A/ }));
  await screen.findByText('Amal');
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

describe('the Held dialog', () => {
  function scheduled(extra: Record<string, Handler> = {}) {
    api({
      [`GET ${detailPath}`]: () => json(200, session),
      [`GET ${attendancePath}`]: () => json(200, roster),
      ...extra,
    });
  }

  it('stays off until the topic, every status and every present student’s homework are set, then sends one request', async () => {
    scheduled({
      [`POST ${detailPath}/held`]: () => json(200, { ...heldSession, cyclesUpdated: [] }),
    });
    renderAt(detailPath);
    const user = userEvent.setup();
    await openDialog(user);

    expect(confirmButton()).toBeDisabled();
    await user.type(screen.getByLabelText('شرحت ايه النهارده؟'), '  Loops  ');
    expect(confirmButton()).toBeDisabled();

    await user.click(within(groupOf('Amal')).getByRole('radio', { name: 'حاضر' }));
    await user.click(within(groupOf('Mona')).getByRole('radio', { name: 'غايب' }));
    // Amal is present but has not chosen a homework rating or "no homework" yet.
    expect(confirmButton()).toBeDisabled();

    await user.click(screen.getByRole('radio', { name: 'مفيش واجب' }));
    expect(confirmButton()).toBeEnabled();
    await user.click(confirmButton());

    await waitFor(() => expect(heldCalls()).toHaveLength(1));
    expect(heldCalls()[0]?.body).toEqual({
      topic: 'Loops',
      attendance: [
        {
          studentId: 's1',
          status: 'present',
          performanceRating: null,
          homeworkRating: null,
          note: null,
        },
        {
          studentId: 's2',
          status: 'absent',
          performanceRating: null,
          homeworkRating: null,
          note: null,
        },
      ],
    });
    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument());
  });

  it('marks everyone present with one button, and still asks for the homework choice', async () => {
    scheduled();
    renderAt(detailPath);
    const user = userEvent.setup();
    await openDialog(user);

    await user.type(screen.getByLabelText('شرحت ايه النهارده؟'), 'Loops');
    await user.click(screen.getByRole('button', { name: 'علّم الكل حاضر' }));

    expect(within(groupOf('Amal')).getByRole('radio', { name: 'حاضر' })).toBeChecked();
    expect(within(groupOf('Mona')).getByRole('radio', { name: 'حاضر' })).toBeChecked();
    expect(confirmButton()).toBeDisabled();
    for (const none of screen.getAllByRole('radio', { name: 'مفيش واجب' })) await user.click(none);
    expect(confirmButton()).toBeEnabled();
  });

  it('keeps the note collapsed until it is opened, and sends it trimmed', async () => {
    scheduled({
      [`POST ${detailPath}/held`]: () => json(200, { ...heldSession, cyclesUpdated: [] }),
    });
    renderAt(detailPath);
    const user = userEvent.setup();
    await openDialog(user);

    expect(screen.queryByLabelText('ملاحظة عن Mona')).not.toBeInTheDocument();
    await user.type(screen.getByLabelText('شرحت ايه النهارده؟'), 'Loops');
    await user.click(within(groupOf('Amal')).getByRole('radio', { name: 'غايب' }));
    await user.click(within(groupOf('Mona')).getByRole('radio', { name: 'غايب' }));
    await user.click(screen.getByRole('button', { name: 'أضف ملاحظة عن Mona' }));
    await user.type(screen.getByLabelText('ملاحظة عن Mona'), '  كانت تعبانة  ');
    await user.click(confirmButton());

    await waitFor(() => expect(heldCalls()).toHaveLength(1));
    const attendance = (
      heldCalls()[0]?.body as { attendance: { studentId: string; note: string | null }[] }
    ).attendance;
    expect(attendance.map((line) => line.note)).toEqual([null, 'كانت تعبانة']);
  });

  it('clears the stars of a student who is switched to absent before sending', async () => {
    scheduled({
      [`POST ${detailPath}/held`]: () => json(200, { ...heldSession, cyclesUpdated: [] }),
    });
    renderAt(detailPath);
    const user = userEvent.setup();
    await openDialog(user);

    await user.type(screen.getByLabelText('شرحت ايه النهارده؟'), 'Loops');
    await user.click(within(groupOf('Amal')).getByRole('radio', { name: 'حاضر' }));
    await user.click(
      within(screen.getByRole('radiogroup', { name: 'تقييم الأداء Amal' })).getByRole('radio', {
        name: '4 من 5',
      }),
    );
    await user.click(within(groupOf('Amal')).getByRole('radio', { name: 'غايب' }));
    await user.click(within(groupOf('Mona')).getByRole('radio', { name: 'غايب' }));
    await user.click(confirmButton());

    await waitFor(() => expect(heldCalls()).toHaveLength(1));
    expect(heldCalls()[0]?.body).toMatchObject({
      attendance: [
        { studentId: 's1', status: 'absent', performanceRating: null, homeworkRating: null },
        { studentId: 's2', status: 'absent', performanceRating: null, homeworkRating: null },
      ],
    });
  });

  it('cannot be confirmed twice while the request runs', async () => {
    let release: (response: Response) => void = () => undefined;
    scheduled({
      [`POST ${detailPath}/held`]: () =>
        new Promise<Response>((resolve) => {
          release = resolve;
        }) as unknown as Response,
    });
    renderAt(detailPath);
    const user = userEvent.setup();
    await openDialog(user);

    await user.type(screen.getByLabelText('شرحت ايه النهارده؟'), 'Loops');
    await user.click(screen.getByRole('button', { name: 'علّم الكل حاضر' }));
    for (const none of screen.getAllByRole('radio', { name: 'مفيش واجب' })) await user.click(none);
    await user.click(confirmButton());

    await waitFor(() => expect(confirmButton()).toBeDisabled());
    await user.click(confirmButton());
    expect(heldCalls()).toHaveLength(1);
    release(json(200, { ...heldSession, cyclesUpdated: [] }));
    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument());
  });

  it('stays open on ATTENDANCE_INCOMPLETE, loads the students again and keeps what was typed', async () => {
    let rosterReads = 0;
    scheduled({
      [`GET ${attendancePath}`]: () => {
        rosterReads += 1;
        return json(200, roster);
      },
      [`POST ${detailPath}/held`]: () => problem(422, 'ATTENDANCE_INCOMPLETE'),
    });
    renderAt(detailPath);
    const user = userEvent.setup();
    await openDialog(user);

    await user.type(screen.getByLabelText('شرحت ايه النهارده؟'), 'Loops');
    await user.click(screen.getByRole('button', { name: 'علّم الكل حاضر' }));
    for (const none of screen.getAllByRole('radio', { name: 'مفيش واجب' })) await user.click(none);
    await user.click(confirmButton());

    expect(
      await screen.findByText('قايمة الطلاب اتغيرت. راجع الحضور وسجّل كل الطلاب'),
    ).toBeInTheDocument();
    await waitFor(() => expect(rosterReads).toBeGreaterThan(1));
    expect(screen.getByLabelText('شرحت ايه النهارده؟')).toHaveValue('Loops');
    expect(within(groupOf('Amal')).getByRole('radio', { name: 'حاضر' })).toBeChecked();
  });

  it('takes an empty list for a session with no students', async () => {
    scheduled({
      [`GET ${attendancePath}`]: () => json(200, { sessionId: session.id, records: [] }),
      [`POST ${detailPath}/held`]: () => json(200, { ...heldSession, cyclesUpdated: [] }),
    });
    renderAt(detailPath);
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: /سجّل حصة جروب A/ }));
    await user.type(await screen.findByLabelText('شرحت ايه النهارده؟'), 'Loops');
    await user.click(confirmButton());

    await waitFor(() => expect(heldCalls()).toHaveLength(1));
    expect(heldCalls()[0]?.body).toEqual({ topic: 'Loops', attendance: [] });
  });
});

describe('the topic and the notes on the session details', () => {
  it('shows the topic and the notes of a Held session, and corrects the topic', async () => {
    let topic = 'Loops';
    api({
      [`GET ${detailPath}`]: () => json(200, { ...heldSession, topic }),
      [`GET ${attendancePath}`]: () =>
        json(200, {
          sessionId: session.id,
          records: [{ ...student('s1', 'Amal', 'محتاجة متابعة'), status: 'present' }],
        }),
      [`PATCH ${detailPath}`]: () => {
        topic = 'Functions';
        return json(200, { ...heldSession, topic });
      },
    });
    renderAt(detailPath);
    const user = userEvent.setup();

    expect(await screen.findByText('Loops')).toBeInTheDocument();
    expect(await screen.findByDisplayValue('محتاجة متابعة')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'عدّل' }));
    const field = await screen.findByLabelText('شرحت ايه النهارده؟');
    await user.clear(field);
    await user.type(field, '  Functions ');
    await user.click(screen.getByRole('button', { name: 'احفظ' }));

    await waitFor(() =>
      expect(calls.find((c) => c.method === 'PATCH')?.body).toEqual({ topic: 'Functions' }),
    );
    expect(await screen.findByText('Functions')).toBeInTheDocument();
  });

  it('says a session held before the topic existed has none', async () => {
    api({
      [`GET ${detailPath}`]: () => json(200, { ...heldSession, topic: null }),
      [`GET ${attendancePath}`]: () => json(200, { sessionId: session.id, records: [] }),
    });
    renderAt(detailPath);

    expect(await screen.findByText('ما اتسجلش')).toBeInTheDocument();
  });
});
