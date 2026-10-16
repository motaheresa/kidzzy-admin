import type { InstructorDetail, Me, Page, Student } from '@kidzzy/shared';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest';
import { AppProviders } from './providers';
import { routes } from './router';

// US-02 (SCRUM-16) through the real routes, with the API mocked at fetch.

const base: Me = {
  id: 'u1',
  name: 'Mona',
  email: 'mona@test.local',
  phone: null,
  roles: ['Admin'],
  permissions: ['students.read:any', 'instructors.read:any', 'instructors.manage:any'],
  mustChangePassword: false,
  academy: { id: 'a1', name: 'KidzzyCoders', timezone: 'Africa/Cairo' },
};

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
const problem = (status: number, code: string) =>
  json(status, { type: 'about:blank', title: 'Error', status, code });
const noContent = () => new Response(null, { status: 204 });
const emptyPage = <T,>(): Page<T> => ({ data: [], meta: { page: 1, pageSize: 20, total: 0 } });

let fetchMock: MockInstance<typeof fetch>;
let calls: { method: string; path: string; body: unknown }[];
/** The current session; tests change it to play the server's side. */
let me: Me;

function api(handlers: Record<string, () => Response> = {}) {
  fetchMock.mockImplementation((input, init = {}) => {
    const url = new URL(String(input), 'http://localhost');
    const method = init.method ?? 'GET';
    const path = url.pathname.replace('/api/v1', '');
    calls.push({ method, path, body: init.body ? JSON.parse(String(init.body)) : undefined });
    if (path === '/auth/me') return Promise.resolve(json(200, me));
    const handler = handlers[`${method} ${path}`];
    return Promise.resolve(handler ? handler() : problem(404, 'NOT_FOUND'));
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

beforeEach(() => {
  calls = [];
  me = base;
  fetchMock = vi.spyOn(globalThis, 'fetch');
});
afterEach(() => vi.restoreAllMocks());

describe('a temporary password', () => {
  it('sends the user to /change-password with returnTo, with no navigation', async () => {
    me = { ...base, mustChangePassword: true };
    api();
    const router = renderAt('/students?isActive=true');

    expect(await screen.findByRole('heading', { name: 'تغيير كلمة السر' })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/change-password');
    expect(new URLSearchParams(router.state.location.search).get('returnTo')).toBe(
      '/students?isActive=true',
    );
    expect(screen.queryByRole('navigation', { name: 'الأقسام' })).not.toBeInTheDocument();
    expect(screen.getByText(/كلمة السر اللي دخلت بيها مؤقتة/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'تسجيل الخروج' })).toBeInTheDocument();
    // The students screen never asked for its data.
    expect(calls.some((c) => c.path === '/students')).toBe(false);
  });

  it('after the change, goes back to the page the user asked for', async () => {
    me = { ...base, mustChangePassword: true };
    api({
      'POST /auth/change-password': () => {
        me = { ...base, mustChangePassword: false };
        return noContent();
      },
      'GET /students': () => json(200, emptyPage<Student>()),
    });
    const router = renderAt('/students');
    const user = userEvent.setup();

    await user.type(await screen.findByLabelText('كلمة السر الحالية'), 'temp-pass-1');
    await user.type(screen.getByLabelText('كلمة السر الجديدة'), 'my-own-pass-1');
    await user.type(screen.getByLabelText('اكتب كلمة السر الجديدة تاني'), 'my-own-pass-1');
    await user.click(screen.getByRole('button', { name: 'تغيير كلمة السر' }));

    await waitFor(() => expect(router.state.location.pathname).toBe('/students'));
    expect(await screen.findByRole('heading', { name: 'الطلاب' })).toBeInTheDocument();
    expect(calls.find((c) => c.method === 'POST')?.body).toEqual({
      currentPassword: 'temp-pass-1',
      newPassword: 'my-own-pass-1',
    });
  });

  it('a 403 PASSWORD_CHANGE_REQUIRED on an open screen re-reads the session and redirects', async () => {
    let resetMeanwhile = false;
    api({
      'GET /instructors': () => {
        // An admin reset the password while this screen was open.
        resetMeanwhile = true;
        me = { ...base, mustChangePassword: true };
        return problem(403, 'PASSWORD_CHANGE_REQUIRED');
      },
    });
    const router = renderAt('/instructors');

    await waitFor(() => expect(router.state.location.pathname).toBe('/change-password'));
    expect(resetMeanwhile).toBe(true);
  });
});

describe('the change-password form', () => {
  it('checks the confirmation before sending', async () => {
    api();
    renderAt('/change-password');
    const user = userEvent.setup();
    await user.type(await screen.findByLabelText('كلمة السر الحالية'), 'old-pass-1');
    await user.type(screen.getByLabelText('كلمة السر الجديدة'), 'new-pass-1');
    await user.type(screen.getByLabelText('اكتب كلمة السر الجديدة تاني'), 'new-pass-2');
    await user.click(screen.getByRole('button', { name: 'تغيير كلمة السر' }));

    expect(screen.getByText('التأكيد مش زي كلمة السر الجديدة')).toBeInTheDocument();
    expect(calls.some((c) => c.method === 'POST')).toBe(false);
  });

  it.each([
    ['CURRENT_PASSWORD_INCORRECT', 'كلمة السر الحالية', 'كلمة السر الحالية مش صحيحة'],
    ['PASSWORD_UNCHANGED', 'كلمة السر الجديدة', 'اختار كلمة سر جديدة غير الحالية'],
  ])('shows %s under its field', async (code, label, message) => {
    api({ 'POST /auth/change-password': () => problem(422, code) });
    renderAt('/change-password');
    const user = userEvent.setup();
    await user.type(await screen.findByLabelText('كلمة السر الحالية'), 'old-pass-1');
    await user.type(screen.getByLabelText('كلمة السر الجديدة'), 'new-pass-1');
    await user.type(screen.getByLabelText('اكتب كلمة السر الجديدة تاني'), 'new-pass-1');
    await user.click(screen.getByRole('button', { name: 'تغيير كلمة السر' }));

    await waitFor(() =>
      expect(screen.getByLabelText(label)).toHaveAttribute('aria-invalid', 'true'),
    );
    expect(screen.getByLabelText(label)).toHaveAccessibleDescription(
      expect.stringContaining(message) as string,
    );
  });

  it('is linked from the header for every signed-in user', async () => {
    me = { ...base, permissions: [] };
    api();
    renderAt('/');
    expect(await screen.findByRole('link', { name: 'تغيير كلمة السر' })).toHaveAttribute(
      'href',
      '/change-password',
    );
  });
});

describe('reset by the admin', () => {
  const instructor: InstructorDetail = {
    id: '6f1c2c3e-1b52-4c43-9d1e-2f6b8a7c9d10',
    name: 'Mona Adel',
    email: 'mona.adel@test.local',
    phone: null,
    isActive: true,
    createdAt: '2026-10-16T08:30:00.000Z',
    groups: [],
  };

  it('sets a temporary password and shows it once', async () => {
    api({
      [`GET /instructors/${instructor.id}`]: () => json(200, instructor),
      [`POST /instructors/${instructor.id}/reset-password`]: () => noContent(),
    });
    renderAt(`/instructors/${instructor.id}`);
    const user = userEvent.setup();

    await user.click(await screen.findByRole('button', { name: 'كلمة سر مؤقتة' }));
    const dialog = screen.getByRole('alertdialog', { name: 'كلمة سر مؤقتة لـ Mona Adel' });
    await user.click(within(dialog).getByRole('button', { name: 'اعمل كلمة سر' }));
    const generated = (within(dialog).getByLabelText('كلمة السر المؤقتة') as HTMLInputElement)
      .value;
    expect(generated).toHaveLength(10);
    await user.click(within(dialog).getByRole('button', { name: 'احفظ كلمة السر' }));

    const shown = await screen.findByRole('alertdialog', {
      name: 'كلمة السر المؤقتة لـ Mona Adel',
    });
    expect(within(shown).getByText(generated)).toBeInTheDocument();
    expect(calls.find((c) => c.method === 'POST')?.body).toEqual({
      temporaryPassword: generated,
    });

    // Closed, it is gone: opening again starts empty.
    await user.click(within(shown).getByRole('button', { name: 'تمام' }));
    expect(screen.queryByText(generated)).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'كلمة سر مؤقتة' }));
    expect(screen.getByLabelText('كلمة السر المؤقتة')).toHaveValue('');
  });

  it('shows a short password’s error in the dialog', async () => {
    api({
      [`GET /instructors/${instructor.id}`]: () => json(200, instructor),
      [`POST /instructors/${instructor.id}/reset-password`]: () =>
        json(400, {
          type: 'about:blank',
          title: 'Bad Request',
          status: 400,
          code: 'VALIDATION_FAILED',
          errors: [{ field: 'temporaryPassword', message: 'too short' }],
        }),
    });
    renderAt(`/instructors/${instructor.id}`);
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'كلمة سر مؤقتة' }));
    await user.type(screen.getByLabelText('كلمة السر المؤقتة'), 'short');
    await user.click(screen.getByRole('button', { name: 'احفظ كلمة السر' }));

    expect(
      await screen.findByText('كلمة السر المؤقتة لازم تكون 8 حروف على الاقل'),
    ).toBeInTheDocument();
    expect(screen.getByRole('alertdialog', { name: 'كلمة سر مؤقتة لـ Mona Adel' })).toBeVisible();
  });
});
