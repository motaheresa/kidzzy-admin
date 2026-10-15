import { useState } from 'react';
import type { Me } from '@kidzzy/shared';
import { LoginPage } from './features/auth/LoginPage';
import { api } from './lib/api';

/**
 * App shell. After login it shows who is signed in until the real screens arrive.
 * The session lives in httpOnly cookies; reopening the page shows the login form again
 * until GET /auth/me (US-03) lets the app ask who is signed in.
 */
export default function App() {
  const [me, setMe] = useState<Me | null>(null);

  if (!me) return <LoginPage onLoggedIn={setMe} />;

  async function logout() {
    await api('/auth/logout', { method: 'POST' }).catch(() => undefined);
    setMe(null);
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-xl flex-col items-center justify-center gap-4 p-6 text-center">
      <h1 className="text-2xl font-semibold">اهلا {me.name}</h1>
      <p className="text-neutral-600">
        {me.academy.name} · {me.roles.join('، ')}
      </p>
      <button onClick={logout} className="rounded-lg border border-neutral-300 px-4 py-2 text-sm">
        تسجيل الخروج
      </button>
    </main>
  );
}
