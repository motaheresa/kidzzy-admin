import { useState, type FormEvent } from 'react';
import { Alert, Button, TextField } from '../../../components/ui';
import { useLogin } from '../hooks/useLogin';

/**
 * The staff login form (US-01): email or phone, and password. It shows its own errors: the
 * general Arabic message in an alert, and a message under each field the API refused.
 * After login, useLogin opens the page the user asked for.
 */
export function LoginForm() {
  const [login, setLogin] = useState('');
  const [password, setPassword] = useState('');
  const loginMutation = useLogin();
  const error = loginMutation.error;

  function submit(event: FormEvent) {
    event.preventDefault();
    loginMutation.mutate({ login, password });
  }

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
        error={error?.fieldErrors.login}
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
        error={error?.fieldErrors.password}
        className="text-left"
      />

      {error && <Alert>{error.message}</Alert>}

      <Button type="submit" disabled={loginMutation.isPending}>
        {loginMutation.isPending ? 'جاري الدخول…' : 'دخول'}
      </Button>
    </form>
  );
}
