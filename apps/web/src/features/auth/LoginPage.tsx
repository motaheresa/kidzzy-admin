import { useState, type FormEvent } from 'react';
import { ErrorCode, type Me } from '@kidzzy/shared';
import { api, ApiError } from '../../lib/api';

const MESSAGES: Partial<Record<ErrorCode, string>> = {
  // One message for wrong password, unknown account and deactivated account (US-01).
  [ErrorCode.InvalidCredentials]: 'بيانات الدخول غير صحيحة',
  [ErrorCode.RateLimited]: 'محاولات كثيرة، جرب تاني بعد دقيقة',
  [ErrorCode.ValidationFailed]: 'اكتب الايميل او رقم الموبايل، وكلمة سر من 8 حروف على الاقل',
};
const FALLBACK = 'حصلت مشكلة، جرب تاني';

/** Staff login with email or phone (US-01). Layout is temporary until the high-fidelity design. */
export function LoginPage({ onLoggedIn }: { onLoggedIn: (me: Me) => void }) {
  const [login, setLogin] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setPending(true);
    setError(null);
    try {
      onLoggedIn(await api<Me>('/auth/login', { method: 'POST', body: { login, password } }));
    } catch (e) {
      setError((e instanceof ApiError && MESSAGES[e.code]) || FALLBACK);
      setPending(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-6 p-6">
      <header className="text-center">
        <h1 className="text-2xl font-semibold">كيدزي كودرز</h1>
        <p className="text-neutral-600">تسجيل الدخول</p>
      </header>

      <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
        <label className="flex flex-col gap-1">
          <span className="text-sm">الايميل او رقم الموبايل</span>
          <input
            name="login"
            dir="ltr"
            autoComplete="username"
            required
            value={login}
            onChange={(e) => setLogin(e.target.value)}
            className="rounded-lg border border-neutral-300 bg-white px-3 py-2 text-left"
          />
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-sm">كلمة السر</span>
          <input
            name="password"
            type="password"
            dir="ltr"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="rounded-lg border border-neutral-300 bg-white px-3 py-2 text-left"
          />
        </label>

        {error && (
          <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={pending}
          className="rounded-lg bg-neutral-900 px-4 py-2 font-medium text-white disabled:opacity-60"
        >
          {pending ? 'جاري الدخول…' : 'دخول'}
        </button>
      </form>
    </main>
  );
}
