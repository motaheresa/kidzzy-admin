import type { MaterialLink, Me } from '@kidzzy/shared';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest';
import { AppProviders } from './providers';
import { routes } from './router';

// The material links screen (US-32, US-33), through the real routes with the API mocked at fetch.

const admin: Me = {
  id: 'admin-1',
  name: 'Mohamed',
  email: 'admin@test.local',
  phone: null,
  roles: ['Admin'],
  permissions: ['materials.read:any', 'materials.manage:any'],
  mustChangePassword: false,
  pendingEvaluations: 0,
  academy: { id: 'a1', name: 'KidzzyCoders', timezone: 'Africa/Cairo' },
};

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
const problem = (status: number, code: string, errors?: { field: string; message: string }[]) =>
  json(status, { type: 'about:blank', title: 'Error', status, code, errors });

const link = (id: string, title: string, sortOrder: number, host = 'drive.google.com') => ({
  id,
  title,
  url: `https://${host}/${id}`,
  sortOrder,
});

const DEFAULTS: MaterialLink[] = [
  link('scratch', 'Scratch', 1),
  link('python', 'Python', 2, 'docs.python.org'),
  link('web', 'Web', 3),
];

let fetchMock: MockInstance<typeof fetch>;
let calls: { method: string; path: string; body: unknown }[];
let links: MaterialLink[];
/** What a test answers a write with instead of the fake doing it. */
let onWrite: (method: string, path: string) => Response | Promise<Response> | undefined;

function api(me: Me) {
  fetchMock.mockImplementation((input, init = {}) => {
    const url = new URL(String(input), 'http://localhost');
    const method = init.method ?? 'GET';
    const path = url.pathname.replace('/api/v1', '');
    const body: unknown = typeof init.body === 'string' ? JSON.parse(init.body) : undefined;
    if (path === '/auth/me') return Promise.resolve(json(200, me));
    calls.push({ method, path, body });
    if (method === 'GET' && path === '/material-links')
      return Promise.resolve(json(200, { data: links }));
    const override = method === 'GET' ? undefined : onWrite(method, path);
    if (override) return Promise.resolve(override);
    if (method === 'PUT' && path === '/material-links/order') {
      const { ids } = body as { ids: string[] };
      links = ids.map((id, index) => ({
        ...(links.find((item) => item.id === id) as MaterialLink),
        sortOrder: index + 1,
      }));
      return Promise.resolve(json(200, { data: links }));
    }
    const id = path.split('/')[2];
    if (method === 'POST' && path === '/material-links') {
      const created = { id: 'new', sortOrder: links.length + 1, ...(body as object) };
      links = [...links, created as MaterialLink];
      return Promise.resolve(json(201, created));
    }
    if (method === 'PATCH') {
      links = links.map((item) => (item.id === id ? { ...item, ...(body as object) } : item));
      return Promise.resolve(
        json(
          200,
          links.find((item) => item.id === id),
        ),
      );
    }
    if (method === 'DELETE') {
      links = links.filter((item) => item.id !== id);
      return Promise.resolve(new Response(null, { status: 204 }));
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
const list = () => screen.findByRole('list', { name: 'لينكات المواد' });
/** The titles on the screen, in their order. */
const titles = () =>
  within(screen.getByRole('list', { name: 'لينكات المواد' }))
    .getAllByRole('listitem')
    .map((item) => DEFAULTS.find((known) => item.textContent?.includes(known.title))?.title);
const button = (name: string) => screen.getByRole('button', { name });

beforeEach(() => {
  calls = [];
  links = DEFAULTS.map((item) => ({ ...item }));
  onWrite = () => undefined;
  fetchMock = vi.spyOn(globalThis, 'fetch');
});
afterEach(() => vi.restoreAllMocks());

describe('the material links screen, for the admin', () => {
  it('is in the nav', async () => {
    api(admin);
    renderAt('/');
    expect(await screen.findByRole('link', { name: 'المواد' })).toHaveAttribute(
      'href',
      '/materials',
    );
  });

  it('shows the links in their order, each with its title and domain', async () => {
    api(admin);
    renderAt('/materials');
    const items = within(await list()).getAllByRole('listitem');
    expect(titles()).toEqual(['Scratch', 'Python', 'Web']);
    expect(within(items[1]).getByText('docs.python.org')).toBeInTheDocument();
  });

  it('says so when there is no link yet', async () => {
    api(admin);
    links = [];
    renderAt('/materials');
    expect(await screen.findByText('مفيش لينكات لسه')).toBeInTheDocument();
    expect(button('اضافة لينك')).toBeEnabled();
  });

  it('adds a link, which goes to the end', async () => {
    api(admin);
    renderAt('/materials');
    const user = userEvent.setup();
    await list();

    await user.click(button('اضافة لينك'));
    const dialog = await screen.findByRole('alertdialog');
    await user.type(within(dialog).getByLabelText('العنوان'), 'Robotics');
    await user.type(within(dialog).getByLabelText('اللينك'), 'https://example.com/robots');
    await user.click(within(dialog).getByRole('button', { name: 'احفظ' }));

    await waitFor(() =>
      expect(writes()).toEqual([
        {
          method: 'POST',
          path: '/material-links',
          body: { title: 'Robotics', url: 'https://example.com/robots' },
        },
      ]),
    );
    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument());
    const items = within(await list()).getAllByRole('listitem');
    expect(items).toHaveLength(4);
    expect(items[3]).toHaveTextContent('Robotics');
  });

  it('shows each refused field under it and keeps the dialog open', async () => {
    api(admin);
    onWrite = () =>
      problem(400, 'VALIDATION_FAILED', [
        { field: 'title', message: 'title must be 1 to 100 characters' },
        { field: 'url', message: 'url must be an http or https address' },
      ]);
    renderAt('/materials');
    const user = userEvent.setup();
    await list();

    await user.click(button('اضافة لينك'));
    const dialog = await screen.findByRole('alertdialog');
    await user.click(within(dialog).getByRole('button', { name: 'احفظ' }));

    await waitFor(() =>
      expect(within(dialog).getByLabelText('العنوان')).toHaveAccessibleDescription(
        'العنوان من 1 لـ 100 حرف',
      ),
    );
    expect(within(dialog).getByLabelText('اللينك')).toHaveAccessibleDescription(
      'اكتب لينك كامل يبدأ بـ https:// او http:// (لحد 2048 حرف)',
    );
    expect(within(dialog).queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.getByRole('alertdialog')).toBeInTheDocument();
  });

  it('shows the limit of 100 in the dialog', async () => {
    api(admin);
    onWrite = () => problem(422, 'MATERIAL_LINKS_LIMIT');
    renderAt('/materials');
    const user = userEvent.setup();
    await list();

    await user.click(button('اضافة لينك'));
    const dialog = await screen.findByRole('alertdialog');
    await user.click(within(dialog).getByRole('button', { name: 'احفظ' }));

    expect(await within(dialog).findByRole('alert')).toHaveTextContent(
      'وصلت للحد الأقصى: 100 لينك',
    );
  });

  it('disables "add" at 100 links and says why', async () => {
    api(admin);
    links = Array.from({ length: 100 }, (_, index) =>
      link(`l${index}`, `Link ${index}`, index + 1),
    );
    renderAt('/materials');
    expect(await screen.findByText(/وصلت للحد الأقصى/)).toBeInTheDocument();
    expect(button('اضافة لينك')).toBeDisabled();
  });

  it('edits a link, starting from its title and address', async () => {
    api(admin);
    renderAt('/materials');
    const user = userEvent.setup();
    await list();

    await user.click(button('عدّل Python'));
    const dialog = await screen.findByRole('alertdialog');
    const title = within(dialog).getByLabelText('العنوان');
    expect(title).toHaveValue('Python');
    expect(within(dialog).getByLabelText('اللينك')).toHaveValue('https://docs.python.org/python');
    await user.clear(title);
    await user.type(title, 'Python basics');
    await user.click(within(dialog).getByRole('button', { name: 'احفظ' }));

    await waitFor(() =>
      expect(writes()).toEqual([
        {
          method: 'PATCH',
          path: '/material-links/python',
          body: { title: 'Python basics', url: 'https://docs.python.org/python' },
        },
      ]),
    );
    expect(await screen.findByText('Python basics')).toBeInTheDocument();
  });

  it('deletes only after the confirmation', async () => {
    api(admin);
    renderAt('/materials');
    const user = userEvent.setup();
    await list();

    await user.click(button('امسح Python'));
    let dialog = await screen.findByRole('alertdialog');
    await user.click(within(dialog).getByRole('button', { name: 'رجوع' }));
    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument());
    expect(writes()).toEqual([]);

    await user.click(button('امسح Python'));
    dialog = await screen.findByRole('alertdialog');
    await user.click(within(dialog).getByRole('button', { name: 'امسح' }));

    await waitFor(() =>
      expect(writes()).toEqual([
        { method: 'DELETE', path: '/material-links/python', body: undefined },
      ]),
    );
    await waitFor(() => expect(screen.queryByText('Python')).not.toBeInTheDocument());
    expect(titles()).toEqual(['Scratch', 'Web']);
  });

  it('cannot move the first link up or the last one down', async () => {
    api(admin);
    renderAt('/materials');
    await list();
    expect(button('حرّك Scratch لفوق')).toBeDisabled();
    expect(button('حرّك Scratch لتحت')).toBeEnabled();
    expect(button('حرّك Python لفوق')).toBeEnabled();
    expect(button('حرّك Python لتحت')).toBeEnabled();
    expect(button('حرّك Web لتحت')).toBeDisabled();
  });

  it('moves a link at once, saves the whole order and ignores moves while saving', async () => {
    api(admin);
    let answer: (response: Response) => void = () => undefined;
    onWrite = () => new Promise<Response>((resolve) => (answer = resolve));
    renderAt('/materials');
    const user = userEvent.setup();
    await list();

    await user.click(button('حرّك Web لفوق'));

    // The new order is on the screen before the API has answered.
    await waitFor(() => expect(titles()).toEqual(['Scratch', 'Web', 'Python']));
    expect(writes()).toEqual([
      {
        method: 'PUT',
        path: '/material-links/order',
        body: { ids: ['scratch', 'web', 'python'] },
      },
    ]);
    expect(button('حرّك Web لفوق')).toHaveAttribute('aria-disabled', 'true');
    await user.click(button('حرّك Web لفوق'));
    expect(writes()).toHaveLength(1);

    links = [DEFAULTS[0], DEFAULTS[2], DEFAULTS[1]];
    answer(json(200, { data: links }));
    await waitFor(() =>
      expect(button('حرّك Web لفوق')).not.toHaveAttribute('aria-disabled', 'true'),
    );
    expect(titles()).toEqual(['Scratch', 'Web', 'Python']);
  });

  it('moves a link down', async () => {
    api(admin);
    renderAt('/materials');
    const user = userEvent.setup();
    await list();

    await user.click(button('حرّك Scratch لتحت'));
    await waitFor(() => expect(writes()[0]?.body).toEqual({ ids: ['python', 'scratch', 'web'] }));
    await waitFor(() => expect(titles()).toEqual(['Python', 'Scratch', 'Web']));
  });

  it('puts the order back and says why when saving it fails', async () => {
    api(admin);
    let answer: (response: Response) => void = () => undefined;
    onWrite = () => new Promise<Response>((resolve) => (answer = resolve));
    renderAt('/materials');
    const user = userEvent.setup();
    await list();

    await user.click(button('حرّك Python لفوق'));
    await waitFor(() => expect(titles()).toEqual(['Python', 'Scratch', 'Web']));

    answer(problem(422, 'VALIDATION_FAILED', [{ field: 'ids', message: 'Send every link once' }]));
    await waitFor(() => expect(titles()).toEqual(['Scratch', 'Python', 'Web']));
    expect(
      await screen.findByText('قايمة اللينكات اتغيرت، فالترتيب ما اتحفظش. جرب تاني'),
    ).toBeInTheDocument();
  });

  it('puts the order back and toasts a server error', async () => {
    api(admin);
    onWrite = () => problem(500, 'INTERNAL_ERROR');
    renderAt('/materials');
    const user = userEvent.setup();
    await list();

    await user.click(button('حرّك Python لفوق'));
    expect(await screen.findByText('حصلت مشكلة في السيرفر، جرب تاني')).toBeInTheDocument();
    await waitFor(() => expect(titles()).toEqual(['Scratch', 'Python', 'Web']));
  });
});
