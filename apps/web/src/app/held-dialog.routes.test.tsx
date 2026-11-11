import type { Me, Session } from '@kidzzy/shared';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
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
  actualStartedAt: null,
  actualEndedAt: null,
  actualDurationMin: null,
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
      startedAt: '12:00',
      endedAt: '13:00',
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
    expect(heldCalls()[0]?.body).toEqual({
      topic: 'Loops',
      startedAt: '12:00',
      endedAt: '13:00',
      attendance: [],
    });
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

    // The topic and the actual time are both missing.
    expect(await screen.findAllByText('ما اتسجلش')).toHaveLength(2);
  });
});

describe('the actual times of a session (SCRUM-80)', () => {
  const noStudents = () => json(200, { sessionId: session.id, records: [] });
  // Planned 12:00 to 13:00 in Cairo (09:00Z, UTC+3 on 2026-10-22).
  const startedLate = {
    ...heldSession,
    actualStartedAt: '2026-10-22T09:05:00.000Z',
    actualEndedAt: '2026-10-22T10:15:00.000Z',
    actualDurationMin: 70,
  };

  async function openEmptyDialog(user: ReturnType<typeof userEvent.setup>) {
    api({
      [`GET ${detailPath}`]: () => json(200, session),
      [`GET ${attendancePath}`]: noStudents,
      [`POST ${detailPath}/held`]: () => json(200, { ...startedLate, cyclesUpdated: [] }),
    });
    renderAt(detailPath);
    await user.click(await screen.findByRole('button', { name: /سجّل حصة جروب A/ }));
    await screen.findByLabelText('بدأت');
  }

  it('prefills the planned times and shows the length', async () => {
    const user = userEvent.setup();
    await openEmptyDialog(user);
    expect(screen.getByLabelText('بدأت')).toHaveValue('12:00');
    expect(screen.getByLabelText('خلصت')).toHaveValue('13:00');
    expect(screen.getByText('المدة: ساعة')).toBeInTheDocument();
  });

  it('updates the length as the times change, and shows an end before the start as a long session', async () => {
    const user = userEvent.setup();
    await openEmptyDialog(user);
    fireEvent.change(screen.getByLabelText('بدأت'), { target: { value: '12:05' } });
    fireEvent.change(screen.getByLabelText('خلصت'), { target: { value: '13:10' } });
    expect(screen.getByText('المدة: ساعة و5 دقايق')).toBeInTheDocument();
    // 11:00 is before 12:05, so the server reads it as the next day.
    fireEvent.change(screen.getByLabelText('خلصت'), { target: { value: '11:00' } });
    expect(screen.getByText('المدة: 22 ساعة و55 دقيقة')).toBeInTheDocument();
  });

  it('sends the typed times, and stays off while one is empty', async () => {
    const user = userEvent.setup();
    await openEmptyDialog(user);
    await user.type(screen.getByLabelText('شرحت ايه النهارده؟'), 'Loops');
    fireEvent.change(screen.getByLabelText('خلصت'), { target: { value: '' } });
    expect(confirmButton()).toBeDisabled();
    fireEvent.change(screen.getByLabelText('بدأت'), { target: { value: '12:05' } });
    fireEvent.change(screen.getByLabelText('خلصت'), { target: { value: '13:15' } });
    await user.click(confirmButton());
    await waitFor(() => expect(heldCalls()).toHaveLength(1));
    expect(heldCalls()[0]?.body).toMatchObject({ startedAt: '12:05', endedAt: '13:15' });
  });

  it('shows the API’s refusal of the end under its field and keeps the dialog open', async () => {
    const user = userEvent.setup();
    api({
      [`GET ${detailPath}`]: () => json(200, session),
      [`GET ${attendancePath}`]: noStudents,
      [`POST ${detailPath}/held`]: () =>
        json(422, {
          type: 'about:blank',
          title: 'Error',
          status: 422,
          code: 'ACTUAL_TIME_INVALID',
        }),
    });
    renderAt(detailPath);
    await user.click(await screen.findByRole('button', { name: /سجّل حصة جروب A/ }));
    await user.type(await screen.findByLabelText('شرحت ايه النهارده؟'), 'Loops');
    await user.click(confirmButton());
    // Under the field, and in the dialog's alert.
    expect(
      (await screen.findAllByText('وقت الخلاص لازم يكون بعد وقت البداية، ومينفعش يكون في المستقبل'))
        .length,
    ).toBeGreaterThanOrEqual(1);
    expect(screen.getByLabelText('خلصت')).toBeInvalid();
  });

  it('shows the real times, the length and how they differ from the plan', async () => {
    api({
      [`GET ${detailPath}`]: () => json(200, startedLate),
      [`GET ${attendancePath}`]: noStudents,
    });
    renderAt(detailPath);
    expect(
      await screen.findByText('بدأت 12:05 م، خلصت 1:15 م، المدة ساعة و10 دقايق'),
    ).toBeInTheDocument();
    expect(screen.getByText('بدأت متأخر 5 دقايق')).toBeInTheDocument();
    expect(screen.getByText('اطول من المخطط بـ10 دقايق')).toBeInTheDocument();
  });

  it('says nothing about the plan when it ran as planned', async () => {
    api({
      [`GET ${detailPath}`]: () =>
        json(200, {
          ...heldSession,
          actualStartedAt: '2026-10-22T09:02:00.000Z',
          actualEndedAt: '2026-10-22T10:02:00.000Z',
          actualDurationMin: 60,
        }),
      [`GET ${attendancePath}`]: noStudents,
    });
    renderAt(detailPath);
    expect(await screen.findByText('بدأت 12:02 م، خلصت 1:02 م، المدة ساعة')).toBeInTheDocument();
    expect(screen.queryByText(/بدأت متأخر|بدأت بدري|من المخطط/)).not.toBeInTheDocument();
  });

  it('corrects the times with a PATCH that carries both', async () => {
    let times = startedLate;
    api({
      [`GET ${detailPath}`]: () => json(200, times),
      [`GET ${attendancePath}`]: noStudents,
      [`PATCH ${detailPath}`]: () => {
        times = {
          ...startedLate,
          actualStartedAt: '2026-10-22T09:00:00.000Z',
          actualEndedAt: '2026-10-22T10:00:00.000Z',
          actualDurationMin: 60,
        };
        return json(200, times);
      },
    });
    renderAt(detailPath);
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'عدّل الوقت الفعلي' }));
    // It opens with the recorded times.
    expect(screen.getByLabelText('بدأت')).toHaveValue('12:05');
    expect(screen.getByLabelText('خلصت')).toHaveValue('13:15');
    fireEvent.change(screen.getByLabelText('بدأت'), { target: { value: '12:00' } });
    fireEvent.change(screen.getByLabelText('خلصت'), { target: { value: '13:00' } });
    await user.click(screen.getByRole('button', { name: 'احفظ' }));

    await waitFor(() =>
      expect(calls.find((c) => c.method === 'PATCH')?.body).toEqual({
        startedAt: '12:00',
        endedAt: '13:00',
      }),
    );
    expect(await screen.findByText('بدأت 12:00 م، خلصت 1:00 م، المدة ساعة')).toBeInTheDocument();
  });

  it('offers to record the times of a session held before they existed, from the planned ones', async () => {
    api({
      [`GET ${detailPath}`]: () => json(200, heldSession),
      [`GET ${attendancePath}`]: noStudents,
    });
    renderAt(detailPath);
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'سجّل الوقت الفعلي' }));
    expect(screen.getByLabelText('بدأت')).toHaveValue('12:00');
    expect(screen.getByLabelText('خلصت')).toHaveValue('13:00');
  });
});
