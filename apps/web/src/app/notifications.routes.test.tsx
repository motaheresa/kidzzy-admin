import type { AppNotification, Me, Page } from '@kidzzy/shared';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest';
import { AppProviders } from './providers';
import { routes } from './router';

const me: Me = {
  id: 'u1',
  name: 'Mona',
  email: 'mona@test.local',
  phone: null,
  roles: ['Admin'],
  permissions: [],
  mustChangePassword: false,
  academy: { id: 'a1', name: 'KidzzyCoders', timezone: 'Africa/Cairo' },
};

const note: AppNotification = {
  id: '11111111-1111-4111-8111-111111111111',
  type: 'session_reminder',
  title: 'حصة النهاردة',
  body: 'الجروب أ',
  data: { url: '/groups/g1' },
  readAt: null,
  createdAt: '2026-11-01T10:00:00.000Z',
};

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
const problem = (status: number, code: string) =>
  json(status, { type: 'about:blank', title: 'Error', status, code });
const page = (data: AppNotification[]): Page<AppNotification> => ({
  data,
  meta: { page: 1, pageSize: 20, total: data.length },
});

let fetchMock: MockInstance<typeof fetch>;
let calls: { method: string; path: string }[];
const requestPermission = vi.fn(async () => 'granted' as NotificationPermission);
const subscription = {
  endpoint: 'https://push.example/device',
  unsubscribe: vi.fn(async () => true),
  toJSON: () => ({
    endpoint: 'https://push.example/device',
    keys: { p256dh: 'key', auth: 'auth' },
  }),
};
const getSubscription = vi.fn(async () => null as typeof subscription | null);
const subscribe = vi.fn(async () => subscription);
const pushManager = { getSubscription, subscribe };

function api(handlers: Record<string, () => Response> = {}) {
  fetchMock.mockImplementation((input, init = {}) => {
    const url = new URL(String(input), 'http://localhost');
    const method = init.method ?? 'GET';
    const path = url.pathname.replace('/api/v1', '');
    calls.push({ method, path });
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
  localStorage.clear();
  fetchMock = vi.spyOn(globalThis, 'fetch');
  requestPermission.mockClear();
  getSubscription.mockReset();
  getSubscription.mockResolvedValue(null);
  subscribe.mockClear();
  subscription.unsubscribe.mockClear();
  vi.stubGlobal('Notification', { permission: 'default', requestPermission });
  Object.defineProperty(navigator, 'userAgent', {
    configurable: true,
    value: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
  });
  Object.defineProperty(navigator, 'serviceWorker', {
    configurable: true,
    value: {
      getRegistration: async () => ({ pushManager }),
      ready: Promise.resolve({ pushManager }),
    },
  });
  window.matchMedia = () =>
    ({
      matches: false,
      addEventListener() {},
      removeEventListener() {},
    }) as unknown as MediaQueryList;
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('notification center', () => {
  it('shows the unread count on the bell', async () => {
    api({ 'GET /notifications/unread-count': () => json(200, { count: 2 }) });
    renderAt('/');
    expect(await screen.findByRole('link', { name: 'الإشعارات، 2 غير مقروء' })).toHaveAttribute(
      'href',
      '/notifications',
    );
    expect(requestPermission).not.toHaveBeenCalled();
  });

  it('stays off when localStorage has an id but the browser has no subscription', async () => {
    localStorage.setItem('kidzzy.pushSubscriptionId', 'stale');
    getSubscription.mockResolvedValue(null);
    api({ 'GET /notifications/unread-count': () => json(200, { count: 0 }) });
    renderAt('/');
    expect(await screen.findByRole('button', { name: 'تفعيل الإشعارات' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'إيقاف الإشعارات' })).not.toBeInTheDocument();
  });

  it('hides the header button once push is on and offers the stop control on the page', async () => {
    getSubscription.mockResolvedValue(subscription);
    api({
      'GET /notifications/unread-count': () => json(200, { count: 0 }),
      'GET /notifications': () => json(200, page([])),
    });
    renderAt('/notifications');
    expect(await screen.findByText('إشعارات الموبايل شغالة على الجهاز ده.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'تفعيل الإشعارات' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'إيقاف إشعارات الموبايل' })).toBeInTheDocument();
  });

  it('marks a notification read and opens its path', async () => {
    api({
      'GET /notifications/unread-count': () => json(200, { count: 1 }),
      'GET /notifications': () => json(200, page([note])),
      [`POST /notifications/${note.id}/read`]: () => new Response(null, { status: 204 }),
    });
    const router = renderAt('/notifications');
    await userEvent.click(await screen.findByRole('button', { name: /حصة النهاردة/ }));
    await waitFor(() =>
      expect(calls.some((call) => call.method === 'POST' && call.path.endsWith('/read'))).toBe(
        true,
      ),
    );
    await waitFor(() => expect(router.state.location.pathname).toBe('/groups/g1'));
  });

  it('marks every notification read', async () => {
    api({
      'GET /notifications/unread-count': () => json(200, { count: 1 }),
      'GET /notifications': () => json(200, page([note])),
      'POST /notifications/read-all': () => new Response(null, { status: 204 }),
    });
    renderAt('/notifications');
    await userEvent.click(await screen.findByRole('button', { name: 'تعليم الكل كمقروء' }));
    await waitFor(() =>
      expect(calls.some((call) => call.path === '/notifications/read-all')).toBe(true),
    );
  });

  it('asks for permission only when enable is pressed, and posts the subscription', async () => {
    api({
      'GET /notifications/unread-count': () => json(200, { count: 0 }),
      'GET /push/public-key': () => json(200, { publicKey: 'A'.repeat(87) }),
      'POST /push-subscriptions': () =>
        json(201, { id: 'sub-1', userAgent: 'Test', createdAt: note.createdAt }),
    });
    renderAt('/');
    const enable = await screen.findByRole('button', { name: 'تفعيل الإشعارات' });
    expect(requestPermission).not.toHaveBeenCalled();
    await userEvent.click(enable);
    await waitFor(() => expect(requestPermission).toHaveBeenCalledOnce());
    await waitFor(() => expect(subscribe).toHaveBeenCalledOnce());
    await waitFor(() =>
      expect(
        calls.some((call) => call.method === 'POST' && call.path === '/push-subscriptions'),
      ).toBe(true),
    );
  });

  it('disables by posting the current subscription when no id is stored', async () => {
    getSubscription.mockResolvedValue(subscription);
    api({
      'GET /notifications/unread-count': () => json(200, { count: 0 }),
      'GET /notifications': () => json(200, page([])),
      'POST /push-subscriptions': () =>
        json(201, { id: 'sub-2', userAgent: null, createdAt: note.createdAt }),
      'DELETE /push-subscriptions/sub-2': () => new Response(null, { status: 204 }),
    });
    renderAt('/notifications');
    await userEvent.click(await screen.findByRole('button', { name: 'إيقاف إشعارات الموبايل' }));
    await waitFor(() =>
      expect(calls.map((call) => `${call.method} ${call.path}`)).toEqual(
        expect.arrayContaining(['POST /push-subscriptions', 'DELETE /push-subscriptions/sub-2']),
      ),
    );
    expect(subscription.unsubscribe).toHaveBeenCalled();
  });

  it('explains iPhone Safari that is not installed on the page, not in the header', async () => {
    Object.defineProperty(navigator, 'userAgent', {
      configurable: true,
      value: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)',
    });
    api({
      'GET /notifications/unread-count': () => json(200, { count: 0 }),
      'GET /notifications': () => json(200, page([])),
    });
    renderAt('/');
    expect(await screen.findByRole('link', { name: 'الإشعارات' })).toBeInTheDocument();
    expect(screen.queryByText(/الآيفون/)).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('link', { name: 'الإشعارات' }));
    expect(
      await screen.findByText('الإشعارات على الآيفون بتشتغل بعد ما تضيف التطبيق لشاشة البداية.'),
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'تفعيل الإشعارات' })).not.toBeInTheDocument();
    expect(requestPermission).not.toHaveBeenCalled();
  });
});
