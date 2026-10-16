import { LoginForm, type Me } from '../features/auth';

/** The login screen (US-01). Layout is temporary until the high-fidelity design. */
export function LoginPage({ onLoggedIn }: { onLoggedIn: (me: Me) => void }) {
  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-6 p-6">
      <header className="text-center">
        <h1 className="text-2xl font-semibold">كيدزي كودرز</h1>
        <p className="text-neutral-600">تسجيل الدخول</p>
      </header>

      <LoginForm onLoggedIn={onLoggedIn} />
    </main>
  );
}
