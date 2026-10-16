import { useState, type FormEvent } from 'react';
import { ErrorCode } from '@kidzzy/shared';
import { Alert, Button, TextField } from '../../../components/ui';
import { useLogin } from '../hooks/useLogin';
import type { Me } from '../types';

const MESSAGES: Partial<Record<ErrorCode, string>> = {
  // One message for wrong password, unknown account and deactivated account (US-01).
  [ErrorCode.InvalidCredentials]: 'بيانات الدخول غير صحيحة',
  [ErrorCode.RateLimited]: 'محاولات كثيرة، جرب تاني بعد دقيقة',
  [ErrorCode.ValidationFailed]: 'اكتب الايميل او رقم الموبايل، وكلمة سر من 8 حروف على الاقل',
};
const FALLBACK = 'حصلت مشكلة، جرب تاني';

/** The staff login form (US-01): email or phone, and password. It never calls the API itself. */
export function LoginForm({ onLoggedIn }: { onLoggedIn: (me: Me) => void }) {
  const [login, setLogin] = useState('');
  const [password, setPassword] = useState('');
  const loginMutation = useLogin();

  function submit(event: FormEvent) {
    event.preventDefault();
    loginMutation.mutate({ login, password }, { onSuccess: onLoggedIn });
  }

  const error = loginMutation.error && (MESSAGES[loginMutation.error.code] ?? FALLBACK);

  return (
    <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
      <TextField
        label="الايميل او رقم الموبايل"
        name="login"
        dir="ltr"
        autoComplete="username"
        required
        value={login}
        onChange={(e) => setLogin(e.target.value)}
        className="text-left"
      />

      <TextField
        label="كلمة السر"
        name="password"
        type="password"
        dir="ltr"
        autoComplete="current-password"
        required
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        className="text-left"
      />

      {error && <Alert>{error}</Alert>}

      <Button type="submit" disabled={loginMutation.isPending}>
        {loginMutation.isPending ? 'جاري الدخول…' : 'دخول'}
      </Button>
    </form>
  );
}
