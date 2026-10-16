import { useState, type FormEvent } from 'react';
import { Alert, Button, FormField } from '@/components/ui';
import { useChangePassword } from '../hooks/useChangePassword';
import { useSession } from '../hooks/useSession';

const MISMATCH = 'التأكيد مش زي كلمة السر الجديدة';

/**
 * Change your own password (US-02). After an admin's reset it is the only screen the user can
 * open. The API answers a wrong current password (CURRENT_PASSWORD_INCORRECT) and an unchanged
 * one (PASSWORD_UNCHANGED) under their fields; the confirmation is checked here.
 */
export function ChangePasswordForm() {
  const { data: me } = useSession();
  const change = useChangePassword();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [mismatch, setMismatch] = useState(false);
  const fieldErrors = change.error?.fieldErrors ?? {};

  function submit(event: FormEvent) {
    event.preventDefault();
    const differs = newPassword !== confirm;
    setMismatch(differs);
    if (!differs) change.mutate({ currentPassword, newPassword });
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
      {me?.mustChangePassword && (
        <Alert variant="info">
          كلمة السر اللي دخلت بيها مؤقتة. اختار كلمة سر خاصة بيك عشان تكمل.
        </Alert>
      )}
      <FormField
        label="كلمة السر الحالية"
        name="currentPassword"
        type="password"
        dir="ltr"
        autoComplete="current-password"
        className="text-start"
        required
        value={currentPassword}
        onChange={(e) => setCurrentPassword(e.target.value)}
        error={fieldErrors.currentPassword}
      />
      <FormField
        label="كلمة السر الجديدة"
        name="newPassword"
        type="password"
        dir="ltr"
        autoComplete="new-password"
        className="text-start"
        hint="8 حروف على الاقل"
        required
        value={newPassword}
        onChange={(e) => setNewPassword(e.target.value)}
        error={fieldErrors.newPassword}
      />
      <FormField
        label="اكتب كلمة السر الجديدة تاني"
        name="confirmPassword"
        type="password"
        dir="ltr"
        autoComplete="new-password"
        className="text-start"
        required
        value={confirm}
        onChange={(e) => setConfirm(e.target.value)}
        error={mismatch ? MISMATCH : undefined}
      />

      {change.error && <Alert variant="danger">{change.error.message}</Alert>}

      <Button type="submit" className="self-start" loading={change.isPending}>
        تغيير كلمة السر
      </Button>
    </form>
  );
}
