import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import App from './App';

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

async function fillAndSubmit() {
  const user = userEvent.setup();
  await user.type(screen.getByLabelText('الايميل او رقم الموبايل'), 'm@test.local');
  await user.type(screen.getByLabelText('كلمة السر'), 'secret-123');
  await user.click(screen.getByRole('button', { name: 'دخول' }));
}

describe('Login (US-01)', () => {
  afterEach(() => vi.restoreAllMocks());

  it('logs in and shows who is signed in', async () => {
    const fetch = vi.spyOn(globalThis, 'fetch').mockResolvedValue(json(200, me));
    render(<App />);
    await fillAndSubmit();

    expect(await screen.findByText('اهلا Mohamed')).toBeInTheDocument();
    expect(fetch).toHaveBeenCalledWith(
      '/api/v1/auth/login',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ login: 'm@test.local', password: 'secret-123' }),
      }),
    );
  });

  it('shows one generic message for wrong credentials', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      json(401, {
        type: 'about:blank',
        title: 'Unauthorized',
        status: 401,
        code: 'INVALID_CREDENTIALS',
      }),
    );
    render(<App />);
    await fillAndSubmit();

    expect(await screen.findByRole('alert')).toHaveTextContent('بيانات الدخول غير صحيحة');
  });

  it('tells the user to wait after too many attempts', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      json(429, {
        type: 'about:blank',
        title: 'Too Many Requests',
        status: 429,
        code: 'RATE_LIMITED',
      }),
    );
    render(<App />);
    await fillAndSubmit();

    expect(await screen.findByRole('alert')).toHaveTextContent('بعد دقيقة');
  });
});
