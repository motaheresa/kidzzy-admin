import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest';
import { emitSessionExpired } from '@/lib/http';
import { AppProviders } from './providers';
import { routes } from './router';

const me = {
  id: 'u1',
  name: 'Mohamed',
  email: 'm@test.local',
  phone: null,
  roles: ['Admin'],
  permissions: [],
  mustChangePassword: false,
  academy: { id: 'a1', name: 'KidzzyCoders', timezone: 'Africa/Cairo' },
};
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
const unauthenticated = () =>
  json(401, { type: 'about:blank', title: 'Unauthorized', status: 401, code: 'UNAUTHENTICATED' });

let fetchMock: MockInstance<typeof fetch>;
let calls: string[];

/** Answers each API path; anything not listed is "signed out". */
function api(answers: Record<string, () => Response>) {
  fetchMock.mockImplementation((input, init = {}) => {
    const path = String(input).replace('/api/v1', '');
    calls.push(`${init.method ?? 'GET'} ${path}`);
    return Promise.resolve((answers[path] ?? unauthenticated)());
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

async function logIn() {
  const user = userEvent.setup();
  await user.type(await screen.findByLabelText('الايميل او رقم الموبايل'), 'm@test.local');
  await user.type(screen.getByLabelText('كلمة السر'), 'secret-123');
  await user.click(screen.getByRole('button', { name: 'دخول' }));
}

beforeEach(() => {
  calls = [];
  fetchMock = vi.spyOn(globalThis, 'fetch');
});
afterEach(() => vi.restoreAllMocks());

describe('ProtectedLayout', () => {
  it('shows a loader, never the login form, while the session loads', async () => {
    let answer: (response: Response) => void = () => undefined;
    fetchMock.mockImplementation(() => new Promise((resolve) => (answer = resolve)));
    renderAt('/');

    expect(await screen.findByRole('status')).toBeInTheDocument();
    expect(screen.queryByLabelText('كلمة السر')).not.toBeInTheDocument();
    await act(async () => answer(json(200, me)));
    expect(await screen.findByText('اهلا Mohamed')).toBeInTheDocument();
  });

  it('sends a signed-out user to /login with returnTo = the path and query', async () => {
    api({});
    const router = renderAt('/?tab=sessions');

    expect(await screen.findByLabelText('كلمة السر')).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/login');
    expect(new URLSearchParams(router.state.location.search).get('returnTo')).toBe(
      '/?tab=sessions',
    );
  });

  it('refreshes silently when the access token expired but the refresh token is valid', async () => {
    let refreshed = false;
    api({
      '/auth/me': () => (refreshed ? json(200, me) : unauthenticated()),
      '/auth/refresh': () => {
        refreshed = true;
        return new Response(null, { status: 204 });
      },
    });
    renderAt('/');

    expect(await screen.findByText('اهلا Mohamed')).toBeInTheDocument();
    expect(calls).toEqual(['GET /auth/me', 'POST /auth/refresh', 'GET /auth/me']);
  });

  it('sends the user to /login when the session expires while they are on a screen', async () => {
    api({ '/auth/me': () => json(200, me) });
    const router = renderAt('/?tab=1');
    expect(await screen.findByText('اهلا Mohamed')).toBeInTheDocument();

    act(() => emitSessionExpired());

    expect(await screen.findByLabelText('كلمة السر')).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/login');
    expect(new URLSearchParams(router.state.location.search).get('returnTo')).toBe('/?tab=1');
  });

  it('offers to try again, instead of signing out, when the session check fails on the network', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));
    const router = renderAt('/');

    expect(await screen.findByRole('button', { name: 'جرب تاني' })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/');
  });
});

describe('PublicLayout', () => {
  it('sends a signed-in user from /login to home', async () => {
    api({ '/auth/me': () => json(200, me) });
    const router = renderAt('/login');

    expect(await screen.findByText('اهلا Mohamed')).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/');
  });
});

describe('login return path', () => {
  it('returns to returnTo after login', async () => {
    api({ '/auth/login': () => json(200, me) });
    const router = renderAt('/login?returnTo=%2F%3Ftab%3Dsessions');
    await logIn();

    expect(await screen.findByText('اهلا Mohamed')).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/');
    expect(router.state.location.search).toBe('?tab=sessions');
  });

  it.each(['//evil.com', 'https://evil.com', '/\\evil.com'])(
    'falls back to "/" for a malicious returnTo %s',
    async (returnTo) => {
      api({ '/auth/login': () => json(200, me) });
      const router = renderAt(`/login?${new URLSearchParams({ returnTo }).toString()}`);
      await logIn();

      expect(await screen.findByText('اهلا Mohamed')).toBeInTheDocument();
      expect(router.state.location.pathname).toBe('/');
      expect(router.state.location.search).toBe('');
    },
  );

  it('shows the API’s field errors under each field, in Arabic', async () => {
    api({
      '/auth/login': () =>
        json(400, {
          type: 'about:blank',
          title: 'Bad Request',
          status: 400,
          code: 'VALIDATION_FAILED',
          errors: [{ field: 'password', message: 'password must be longer than 8 characters' }],
        }),
    });
    renderAt('/login');
    await logIn();

    expect(await screen.findByText('كلمة السر لازم تكون 8 حروف على الاقل')).toBeInTheDocument();
    expect(screen.getByLabelText('كلمة السر')).toHaveAttribute('aria-invalid', 'true');
    expect(screen.queryByText(/must be longer/)).not.toBeInTheDocument();
  });
});

describe('logout and unknown paths', () => {
  it('logs out to /login, even when the API call fails', async () => {
    api({ '/auth/me': () => json(200, me), '/auth/logout': () => json(500, null) });
    const router = renderAt('/');
    await userEvent.setup().click(await screen.findByRole('button', { name: 'تسجيل الخروج' }));

    expect(await screen.findByLabelText('كلمة السر')).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/login');
  });

  it('logs out to /login when the API answers 204, with one call and no refresh (SCRUM-54)', async () => {
    const seen: string[] = [];
    api({
      '/auth/me': () => json(200, me),
      '/auth/logout': () => {
        seen.push('logout');
        return new Response(null, { status: 204 });
      },
      '/auth/refresh': () => {
        seen.push('refresh');
        return new Response(null, { status: 204 });
      },
    });
    const router = renderAt('/');
    await userEvent.setup().click(await screen.findByRole('button', { name: 'تسجيل الخروج' }));

    expect(await screen.findByLabelText('كلمة السر')).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/login');
    expect(seen).toEqual(['logout']);
  });

  it('shows the not-found page for an unknown path', async () => {
    api({});
    renderAt('/no-such-page');
    expect(await screen.findByText('الصفحة دي مش موجودة')).toBeInTheDocument();
  });
});
