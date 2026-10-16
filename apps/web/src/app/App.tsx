import { useState } from 'react';
import type { Me } from '../features/auth';
import { HomePage } from '../pages/HomePage';
import { LoginPage } from '../pages/LoginPage';
import { AppProviders } from './providers';

/**
 * App shell: picks the screen. After login it shows who is signed in until the real screens
 * arrive. The session lives in httpOnly cookies; reopening the page shows the login form again
 * until GET /auth/me (US-03) lets the app ask who is signed in.
 */
function AppShell() {
  const [me, setMe] = useState<Me | null>(null);

  if (!me) return <LoginPage onLoggedIn={setMe} />;
  return <HomePage me={me} onLoggedOut={() => setMe(null)} />;
}

export default function App() {
  return (
    <AppProviders>
      <AppShell />
    </AppProviders>
  );
}
