import type { Announcement, AppNotification, AudienceUser, Me, Page } from '@kidzzy/shared';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest';
import { AppProviders } from './providers';
import { routes } from './router';

// US-31 (SCRUM-51) through the real routes, with the API mocked at fetch.

const admin: Me = {
  id: 'admin-1',
  name: 'Mona',
  email: 'mona@test.local',
  phone: null,
  roles: ['Admin'],
  permissions: ['announcements.send:any'],
  mustChangePassword: false,
  pendingEvaluations: 0,
  academy: { id: 'a1', name: 'KidzzyCoders', timezone: 'Africa/Cairo' },
};

const instructor: Me = {
  ...admin,
  id: 'ana-id',
  name: 'Ana',
  roles: ['Instructor'],
  permissions: ['groups.read:own'],
};

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
const problem = (status: number, code: string, errors?: unknown) =>
  json(status, { type: 'about:blank', title: 'Error', status, code, errors });
const page = <T,>(data: T[], total = data.length): Page<T> => ({
  data,
  meta: { page: 1, pageSize: 20, total },
});

const sent = (id: string, over: Partial<Announcement> = {}): Announcement => ({
  id,
  title: `Title ${id}`,
  body: `Body ${id}`,
  audience: 'all',
  roleId: null,
  roleName: null,
  recipientCount: 3,
  sender: { id: 'admin-1', name: 'Mona' },
  createdAt: '2026-11-27T10:00:00.000Z',
  ...over,
});

const roles = [
  { id: 'role-admin', name: 'Admin' },
  { id: 'role-instructor', name: 'Instructor' },
];

const people: AudienceUser[] = [
  { id: 'u-ana', name: 'Ana', roles: ['Instructor'] },
  { id: 'u-omar', name: 'Omar', roles: ['Instructor'] },
];

type Handler = (body: unknown) => Response;
let fetchMock: MockInstance<typeof fetch>;
let calls: { method: string; path: string; query: URLSearchParams; body: unknown }[];
let me: Me;

function api(handlers: Record<string, Handler> = {}) {
  const all: Record<string, Handler> = {
    'GET /announcements': () => json(200, page<Announcement>([])),
    'GET /announcements/recipients-count': () => json(200, { count: 3 }),
    'GET /announcements/audience/roles': () => json(200, roles),
    'GET /announcements/audience/users': () => json(200, page(people)),
    'POST /announcements': () => json(201, sent('new')),
    ...handlers,
  };
  fetchMock.mockImplementation((input, init = {}) => {
    const url = new URL(String(input), 'http://localhost');
    const method = init.method ?? 'GET';
    const path = url.pathname.replace('/api/v1', '');
    const body = init.body ? JSON.parse(String(init.body)) : undefined;
    calls.push({ method, path, query: url.searchParams, body });
    if (path === '/auth/me') return Promise.resolve(json(200, me));
    const handler = all[`${method} ${path}`];
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
  calls.filter((c) => c.method === method && c.path === path);

/** Opens the page and the new-announcement form. */
async function openForm() {
  const user = userEvent.setup();
  renderAt('/announcements');
  await user.click(await screen.findByRole('button', { name: 'اعلان جديد' }));
  return { user, form: screen.getByRole('form', { name: 'اعلان جديد' }) };
}

async function writeText(user: ReturnType<typeof userEvent.setup>, form: HTMLElement) {
  await user.type(within(form).getByLabelText('العنوان'), '  Holiday  ');
  await user.type(within(form).getByLabelText('نص الاعلان'), 'No sessions on Thursday.');
}

const next = (form: HTMLElement) => within(form).getByRole('button', { name: 'كمّل' });

beforeEach(() => {
  calls = [];
  me = admin;
  fetchMock = vi.spyOn(globalThis, 'fetch');
});
afterEach(() => vi.restoreAllMocks());

describe('access to announcements', () => {
  it('is not in the nav of an instructor, and opening it shows the forbidden page', async () => {
    me = instructor;
    api();
    renderAt('/announcements');
    expect(await screen.findByText(/مش مسموح/)).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'الاعلانات' })).not.toBeInTheDocument();
    expect(called('GET', '/announcements')).toHaveLength(0);
  });

  it('is in the nav of the admin', async () => {
    api();
    renderAt('/announcements');
    expect(await screen.findByRole('link', { name: 'الاعلانات' })).toHaveAttribute(
      'href',
      '/announcements',
    );
  });
});

describe('the sent list', () => {
  it('shows an empty state', async () => {
    api();
    renderAt('/announcements');
    expect(await screen.findByText('مفيش اعلانات')).toBeInTheDocument();
  });

  it('shows each announcement with its audience, count and sender, and pages through them', async () => {
    api({
      'GET /announcements': () =>
        json(
          200,
          page(
            [
              sent('1', {
                audience: 'role',
                roleId: 'role-instructor',
                roleName: 'Instructor',
                recipientCount: 2,
              }),
              sent('2', { audience: 'users', recipientCount: 1 }),
              sent('3'),
            ],
            25,
          ),
        ),
    });
    const router = renderAt('/announcements');
    const list = await screen.findByRole('list', { name: 'الاعلانات المبعوتة' });
    const [first, second, third] = within(list).getAllByRole('listitem');

    expect(within(first!).getByRole('heading', { name: 'Title 1' })).toBeInTheDocument();
    expect(within(first!).getByText('دور: مدرس')).toBeInTheDocument();
    expect(within(first!).getByText('2 شخص')).toBeInTheDocument();
    expect(within(first!).getByText('Body 1')).toBeInTheDocument();
    expect(within(first!).getByText(/Mona/)).toBeInTheDocument();
    expect(within(second!).getByText('اشخاص')).toBeInTheDocument();
    expect(within(third!).getByText('الكل')).toBeInTheDocument();

    await userEvent.setup().click(screen.getByRole('button', { name: 'التالي' }));
    await waitFor(() => expect(router.state.location.search).toBe('?page=2'));
    expect(called('GET', '/announcements').at(-1)?.query.get('page')).toBe('2');
  });
});

describe('a new announcement', () => {
  it('checks the fields before asking anything, with live counters', async () => {
    api();
    const { user, form } = await openForm();
    expect(within(form).getByText('0 من 100 حرف')).toBeInTheDocument();
    expect(within(form).getByText('0 من 1,000 حرف')).toBeInTheDocument();
    expect(within(form).getByLabelText('العنوان')).toHaveAttribute('maxlength', '100');
    expect(within(form).getByLabelText('نص الاعلان')).toHaveAttribute('maxlength', '1000');

    await user.type(within(form).getByLabelText('العنوان'), '   ');
    expect(within(form).getByText('3 من 100 حرف')).toBeInTheDocument();
    await user.click(next(form));

    expect(within(form).getByText('اكتب عنوان الاعلان')).toBeInTheDocument();
    expect(within(form).getByText('اكتب نص الاعلان')).toBeInTheDocument();

    await user.click(within(form).getByRole('radio', { name: 'دور' }));
    // The same words are the select's first option, so look for the error under it.
    expect(await within(form).findByLabelText('الدور')).toHaveAccessibleDescription('اختار دور');
    await user.click(within(form).getByRole('radio', { name: 'اشخاص' }));
    expect(within(form).getByText('اختار شخص واحد على الاقل')).toBeInTheDocument();
    await user.click(next(form));
    expect(called('GET', '/announcements/recipients-count')).toHaveLength(0);
  });

  it('confirms the number of recipients, then sends to everyone and shows it at the top', async () => {
    let list: Announcement[] = [sent('old')];
    api({
      'GET /announcements': () => json(200, page(list)),
      'POST /announcements': () => {
        const created = sent('new', { title: 'Holiday' });
        list = [created, ...list];
        return json(201, created);
      },
    });
    const { user, form } = await openForm();
    await writeText(user, form);
    await user.click(next(form));

    const dialog = await screen.findByRole('alertdialog');
    expect(within(dialog).getByText(/هيتبعت لـ 3 شخص/)).toBeInTheDocument();
    expect(called('GET', '/announcements/recipients-count')[0]?.query.toString()).toBe(
      'audience=all',
    );
    expect(called('POST', '/announcements')).toHaveLength(0);

    await user.click(within(dialog).getByRole('button', { name: 'ابعت' }));

    expect(await screen.findByText('الاعلان اتبعت لـ 3 شخص')).toBeInTheDocument();
    expect(called('POST', '/announcements')[0]?.body).toEqual({
      title: 'Holiday',
      body: 'No sessions on Thursday.',
      audience: 'all',
    });
    await waitFor(() =>
      expect(screen.queryByRole('form', { name: 'اعلان جديد' })).not.toBeInTheDocument(),
    );
    const rows = within(screen.getByRole('list', { name: 'الاعلانات المبعوتة' })).getAllByRole(
      'heading',
    );
    expect(rows.map((row) => row.textContent)).toEqual(['Holiday', 'Title old']);
  });

  it('sends nothing when the confirmation is cancelled, and keeps the text', async () => {
    api();
    const { user, form } = await openForm();
    await writeText(user, form);
    await user.click(next(form));
    const dialog = await screen.findByRole('alertdialog');
    await user.click(within(dialog).getByRole('button', { name: 'رجوع' }));

    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument());
    expect(within(form).getByLabelText('نص الاعلان')).toHaveValue('No sessions on Thursday.');
    expect(called('POST', '/announcements')).toHaveLength(0);
  });

  it('sends to a role chosen from the academy roles', async () => {
    api({ 'GET /announcements/recipients-count': () => json(200, { count: 2 }) });
    const { user, form } = await openForm();
    await writeText(user, form);
    await user.click(within(form).getByRole('radio', { name: 'دور' }));
    const select = await within(form).findByLabelText('الدور');
    await user.selectOptions(select, 'مدرس');
    await user.click(next(form));

    const dialog = await screen.findByRole('alertdialog');
    expect(within(dialog).getByText(/هيتبعت لـ 2 شخص/)).toBeInTheDocument();
    expect(called('GET', '/announcements/recipients-count')[0]?.query.get('roleId')).toBe(
      'role-instructor',
    );
    await user.click(within(dialog).getByRole('button', { name: 'ابعت' }));
    await waitFor(() => expect(called('POST', '/announcements')).toHaveLength(1));
    expect(called('POST', '/announcements')[0]?.body).toEqual({
      title: 'Holiday',
      body: 'No sessions on Thursday.',
      audience: 'role',
      roleId: 'role-instructor',
    });
  });

  it('sends to the people searched for and ticked, who can be removed', async () => {
    api({ 'GET /announcements/recipients-count': () => json(200, { count: 1 }) });
    const { user, form } = await openForm();
    await writeText(user, form);
    await user.click(within(form).getByRole('radio', { name: 'اشخاص' }));
    await user.click(await within(form).findByRole('checkbox', { name: /Ana/ }));
    await user.click(within(form).getByRole('checkbox', { name: /Omar/ }));
    expect(within(form).getByText(/اخترت 2 من 200/)).toBeInTheDocument();

    await user.type(within(form).getByRole('searchbox', { name: 'دور على شخص' }), 'om{Enter}');
    await waitFor(() =>
      expect(called('GET', '/announcements/audience/users').at(-1)?.query.get('search')).toBe('om'),
    );
    // Enter in the search box does not send the form.
    expect(called('GET', '/announcements/recipients-count')).toHaveLength(0);

    await user.click(within(form).getByRole('button', { name: 'شيل Ana' }));
    expect(within(form).getByText(/اخترت 1 من 200/)).toBeInTheDocument();
    await user.click(next(form));

    const dialog = await screen.findByRole('alertdialog');
    expect(called('GET', '/announcements/recipients-count')[0]?.query.get('userIds')).toBe(
      'u-omar',
    );
    await user.click(within(dialog).getByRole('button', { name: 'ابعت' }));
    await waitFor(() => expect(called('POST', '/announcements')).toHaveLength(1));
    expect(called('POST', '/announcements')[0]?.body).toEqual({
      title: 'Holiday',
      body: 'No sessions on Thursday.',
      audience: 'users',
      userIds: ['u-omar'],
    });
  });

  it('says so when the audience reaches nobody, and asks for no confirmation', async () => {
    api({
      'GET /announcements/recipients-count': () => problem(422, 'ANNOUNCEMENT_NO_RECIPIENTS'),
    });
    const { user, form } = await openForm();
    await writeText(user, form);
    await user.click(next(form));

    expect(
      await within(form).findByText('مفيش ولا حد نشط في الاختيار ده، فمش هيتبعت لحد'),
    ).toBeInTheDocument();
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();

    // A change of the audience clears the old answer.
    await user.click(within(form).getByRole('radio', { name: 'دور' }));
    expect(within(form).queryByText(/مفيش ولا حد نشط/)).not.toBeInTheDocument();
  });

  it('shows a refused person under the picker', async () => {
    api({
      'GET /announcements/recipients-count': () =>
        problem(422, 'VALIDATION_FAILED', [{ field: 'userIds', message: 'inactive' }]),
    });
    const { user, form } = await openForm();
    await writeText(user, form);
    await user.click(within(form).getByRole('radio', { name: 'اشخاص' }));
    await user.click(await within(form).findByRole('checkbox', { name: /Ana/ }));
    await user.click(next(form));

    expect(
      await within(form).findByText('اختار من 1 لـ 200 شخص، وكلهم لسه نشطين'),
    ).toBeInTheDocument();
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
  });

  it('shows the error of a refused send in the dialog and under its field', async () => {
    api({
      'POST /announcements': () =>
        problem(400, 'VALIDATION_FAILED', [{ field: 'title', message: 'too long' }]),
    });
    const { user, form } = await openForm();
    await writeText(user, form);
    await user.click(next(form));
    const dialog = await screen.findByRole('alertdialog');
    await user.click(within(dialog).getByRole('button', { name: 'ابعت' }));

    expect(await within(dialog).findByRole('alert')).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: 'رجوع' }));
    expect(await within(form).findByText('العنوان من 1 لـ 100 حرف')).toBeInTheDocument();
    expect(within(form).getByLabelText('العنوان')).toHaveAttribute('aria-invalid', 'true');
  });
});

describe('an announcement in the notification center', () => {
  it('shows its whole body, line breaks included', async () => {
    const body = `${'A long line of the announcement. '.repeat(20).trim()}\nSecond line.`;
    const note: AppNotification = {
      id: 'n1',
      type: 'announcement',
      title: 'Holiday',
      body,
      data: { url: '/notifications', announcementId: 'new' },
      readAt: '2026-11-27T11:00:00.000Z',
      createdAt: '2026-11-27T10:00:00.000Z',
    };
    me = instructor;
    api({ 'GET /notifications': () => json(200, page([note])) });
    renderAt('/notifications');

    const row = await screen.findByRole('button', { name: /Holiday/ });
    const text = within(row).getByText(/Second line\./);
    expect(text.textContent).toBe(body);
    expect(text).toHaveClass('whitespace-pre-line');
  });
});
