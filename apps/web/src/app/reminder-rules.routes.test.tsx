import type { Me, ReminderRule } from '@kidzzy/shared';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest';
import { AppProviders } from './providers';
import { routes } from './router';

// The reminder rules screen (US-30), through the real routes with the API mocked at fetch.

const admin: Me = {
  id: 'admin-1',
  name: 'Mohamed',
  email: 'admin@test.local',
  phone: null,
  roles: ['Admin'],
  permissions: ['reminders.manage:any'],
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

const rule = (
  id: string,
  type: ReminderRule['type'],
  value: number,
  isActive = true,
): ReminderRule => ({
  id,
  type,
  leadMinutes: type === 'session_reminder' ? value : null,
  sessionsBeforeEnd: type === 'session_reminder' ? null : value,
  isActive,
});

const DEFAULTS: ReminderRule[] = [
  rule('s1440', 'session_reminder', 1440),
  rule('s60', 'session_reminder', 60),
  rule('s90', 'session_reminder', 90, false),
  rule('p2', 'student_payment', 2),
  rule('p1', 'student_payment', 1),
];

let fetchMock: MockInstance<typeof fetch>;
let calls: { method: string; path: string; body: unknown }[];
let rules: ReminderRule[];
let onWrite: (method: string, path: string, body: unknown) => Response | undefined;

function api(me: Me) {
  fetchMock.mockImplementation((input, init = {}) => {
    const url = new URL(String(input), 'http://localhost');
    const method = init.method ?? 'GET';
    const path = url.pathname.replace('/api/v1', '');
    const body: unknown = typeof init.body === 'string' ? JSON.parse(init.body) : undefined;
    calls.push({ method, path, body });
    if (path === '/auth/me') return Promise.resolve(json(200, me));
    if (method === 'GET' && path === '/reminder-rules')
      return Promise.resolve(json(200, { data: rules }));
    const refused = onWrite(method, path, body);
    if (refused) return Promise.resolve(refused);
    if (path.startsWith('/reminder-rules')) {
      if (method === 'DELETE') {
        rules = rules.filter((item) => item.id !== path.split('/')[2]);
        return Promise.resolve(new Response(null, { status: 204 }));
      }
      if (method === 'PATCH') {
        const id = path.split('/')[2];
        rules = rules.map((item) => (item.id === id ? { ...item, ...(body as object) } : item));
        return Promise.resolve(
          json(
            200,
            rules.find((item) => item.id === id),
          ),
        );
      }
      if (method === 'POST') {
        const created = rule('new', (body as ReminderRule).type, 0);
        return Promise.resolve(json(201, { ...created, ...(body as object) }));
      }
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

const writes = () => calls.filter((call) => call.method !== 'GET');
const section = (type: string) => screen.getByTestId('section-' + type);

beforeEach(() => {
  calls = [];
  rules = DEFAULTS.map((item) => ({ ...item }));
  onWrite = () => undefined;
  fetchMock = vi.spyOn(globalThis, 'fetch');
});
afterEach(() => vi.restoreAllMocks());

describe('the reminder rules screen', () => {
  it('is in the nav for the admin', async () => {
    api(admin);
    renderAt('/');
    expect(await screen.findByRole('link', { name: 'قواعد التذكير' })).toHaveAttribute(
      'href',
      '/reminder-rules',
    );
  });

  it('is not in the nav of an instructor, and opening it shows the forbidden page', async () => {
    api(instructorUser);
    renderAt('/reminder-rules');
    expect(await screen.findByText(/مش مسموح/)).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'قواعد التذكير' })).not.toBeInTheDocument();
    expect(calls.some((call) => call.path === '/reminder-rules')).toBe(false);
  });

  it('shows the three sections with each rule in plain Arabic and an off rule marked', async () => {
    api(admin);
    renderAt('/reminder-rules');
    const sessions = within(await screen.findByTestId('section-session_reminder'));
    expect(sessions.getByText('قبل الحصة بيوم')).toBeInTheDocument();
    expect(sessions.getByText('قبل الحصة بساعة')).toBeInTheDocument();
    expect(sessions.getByText('قبل الحصة بـ 90 دقيقة')).toBeInTheDocument();
    expect(sessions.getAllByText('موقوفة')).toHaveLength(1);
    expect(sessions.getByRole('switch', { name: 'وقّف قبل الحصة بيوم' })).toBeChecked();
    expect(sessions.getByRole('switch', { name: 'شغّل قبل الحصة بـ 90 دقيقة' })).not.toBeChecked();

    const students = within(section('student_payment'));
    expect(students.getByText('لما يفضل حصتين')).toBeInTheDocument();
    expect(students.getByText('لما يفضل حصة')).toBeInTheDocument();
    expect(screen.getByTestId('section-instructor_payment')).toBeInTheDocument();
  });

  it('warns in a section with no active rule, and in no other', async () => {
    api(admin);
    renderAt('/reminder-rules');
    const instructors = within(await screen.findByTestId('section-instructor_payment'));
    expect(instructors.getByText(/تنبيه الاستحقاق بس/)).toBeInTheDocument();
    expect(instructors.getByText('مفيش قواعد لسه.')).toBeInTheDocument();
    expect(within(section('session_reminder')).queryByRole('alert')).not.toBeInTheDocument();
    expect(within(section('student_payment')).queryByRole('alert')).not.toBeInTheDocument();
  });

  it('turns a rule off and on with its switch', async () => {
    api(admin);
    renderAt('/reminder-rules');
    const user = userEvent.setup();

    await user.click(await screen.findByRole('switch', { name: 'وقّف قبل الحصة بيوم' }));
    await waitFor(() =>
      expect(writes()).toEqual([
        { method: 'PATCH', path: '/reminder-rules/s1440', body: { isActive: false } },
      ]),
    );
    expect(await screen.findByRole('switch', { name: 'شغّل قبل الحصة بيوم' })).not.toBeChecked();
  });

  it('adds a session rule from a number and a unit', async () => {
    api(admin);
    renderAt('/reminder-rules');
    const user = userEvent.setup();

    await user.click(
      within(await screen.findByTestId('section-session_reminder')).getByRole('button', {
        name: 'اضافة قاعدة',
      }),
    );
    const dialog = await screen.findByRole('alertdialog');
    await user.type(within(dialog).getByLabelText('قبل الحصة بـ'), '2');
    await user.selectOptions(within(dialog).getByLabelText('الوحدة'), 'hours');
    await user.click(within(dialog).getByRole('button', { name: 'احفظ' }));

    await waitFor(() =>
      expect(writes()).toEqual([
        {
          method: 'POST',
          path: '/reminder-rules',
          body: { type: 'session_reminder', leadMinutes: 120 },
        },
      ]),
    );
    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument());
  });

  it('adds a payment rule from a number of sessions', async () => {
    api(admin);
    renderAt('/reminder-rules');
    const user = userEvent.setup();

    await user.click(
      within(await screen.findByTestId('section-instructor_payment')).getByRole('button', {
        name: 'اضافة قاعدة',
      }),
    );
    const dialog = await screen.findByRole('alertdialog');
    expect(within(dialog).queryByLabelText('الوحدة')).not.toBeInTheDocument();
    await user.type(within(dialog).getByLabelText('لما يفضل (عدد الحصص)'), '3');
    await user.click(within(dialog).getByRole('button', { name: 'احفظ' }));

    await waitFor(() =>
      expect(writes()).toEqual([
        {
          method: 'POST',
          path: '/reminder-rules',
          body: { type: 'instructor_payment', sessionsBeforeEnd: 3 },
        },
      ]),
    );
  });

  it('explains a value out of range and sends nothing', async () => {
    api(admin);
    renderAt('/reminder-rules');
    const user = userEvent.setup();

    await user.click(
      within(await screen.findByTestId('section-session_reminder')).getByRole('button', {
        name: 'اضافة قاعدة',
      }),
    );
    const dialog = await screen.findByRole('alertdialog');
    await user.type(within(dialog).getByLabelText('قبل الحصة بـ'), '10');
    await user.selectOptions(within(dialog).getByLabelText('الوحدة'), 'minutes');
    await user.click(within(dialog).getByRole('button', { name: 'احفظ' }));

    expect(await within(dialog).findByText('اكتب مدة من 30 دقيقة لحد 7 ايام')).toBeInTheDocument();
    expect(writes()).toHaveLength(0);
  });

  it('shows the API’s refusal of a duplicate under the field and keeps the dialog open', async () => {
    api(admin);
    onWrite = (method) => (method === 'POST' ? problem(409, 'REMINDER_RULE_EXISTS') : undefined);
    renderAt('/reminder-rules');
    const user = userEvent.setup();

    await user.click(
      within(await screen.findByTestId('section-session_reminder')).getByRole('button', {
        name: 'اضافة قاعدة',
      }),
    );
    const dialog = await screen.findByRole('alertdialog');
    await user.type(within(dialog).getByLabelText('قبل الحصة بـ'), '1');
    await user.selectOptions(within(dialog).getByLabelText('الوحدة'), 'hours');
    await user.click(within(dialog).getByRole('button', { name: 'احفظ' }));

    expect(
      await within(dialog).findByText('القاعدة دي موجودة بالفعل، اكتب قيمة تانية'),
    ).toBeInTheDocument();
    expect(screen.getByRole('alertdialog')).toBeInTheDocument();
  });

  it('changes a rule’s value, starting from its own unit', async () => {
    api(admin);
    renderAt('/reminder-rules');
    const user = userEvent.setup();

    await user.click(await screen.findByRole('button', { name: 'عدّل قبل الحصة بساعة' }));
    const dialog = await screen.findByRole('alertdialog');
    const number = within(dialog).getByLabelText('قبل الحصة بـ');
    expect(number).toHaveValue(1);
    expect(within(dialog).getByLabelText('الوحدة')).toHaveValue('hours');
    await user.clear(number);
    await user.type(number, '3');
    await user.click(within(dialog).getByRole('button', { name: 'احفظ' }));

    await waitFor(() =>
      expect(writes()).toEqual([
        { method: 'PATCH', path: '/reminder-rules/s60', body: { leadMinutes: 180 } },
      ]),
    );
  });

  it('asks before deleting, and warns when it is the last active rule of the section', async () => {
    api(admin);
    rules = rules.filter((item) => item.id !== 'p1'); // p2 is now the only student rule
    renderAt('/reminder-rules');
    const user = userEvent.setup();

    await user.click(await screen.findByRole('button', { name: 'امسح لما يفضل حصتين' }));
    const dialog = await screen.findByRole('alertdialog');
    expect(within(dialog).getByText(/آخر قاعدة شغالة/)).toBeInTheDocument();
    expect(writes()).toHaveLength(0);
    await user.click(within(dialog).getByRole('button', { name: 'امسح' }));

    await waitFor(() =>
      expect(writes()).toEqual([{ method: 'DELETE', path: '/reminder-rules/p2', body: undefined }]),
    );
    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument());
    expect(
      await within(section('student_payment')).findByText(/تنبيه الاستحقاق بس/),
    ).toBeInTheDocument();
  });

  it('disables "add" at 10 rules in a section and says why', async () => {
    api(admin);
    rules = [
      ...rules.filter((item) => item.type !== 'student_payment'),
      ...Array.from({ length: 10 }, (_, index) => rule('x' + index, 'student_payment', index + 1)),
    ];
    renderAt('/reminder-rules');
    const students = within(await screen.findByTestId('section-student_payment'));
    expect(students.getByRole('button', { name: 'اضافة قاعدة' })).toBeDisabled();
    expect(students.getByText(/وصلت للحد الأقصى/)).toBeInTheDocument();
  });
});
