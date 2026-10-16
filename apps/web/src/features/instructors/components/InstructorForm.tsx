import { KeyRoundIcon } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { Alert, Button, FormField } from '@/components/ui';
import type { AppError } from '@/lib/errors';
import { generateTemporaryPassword } from '../temporary-password';

export interface InstructorFormValues {
  name: string;
  /** Empty when not given. */
  email: string;
  phone: string;
  temporaryPassword: string;
}

const EMAIL_OR_PHONE = 'اكتب ايميل او رقم موبايل، واحد منهم على الاقل';

/**
 * The instructor's data, for both create and edit. The values are trimmed; the caller turns
 * them into the API body. With `askPassword`, it also asks for the temporary password, with a
 * button that generates one (shown in clear text, because the admin passes it on).
 *
 * The API decides what is valid and the form shows its answer under each field (AppError
 * fieldErrors, including EMAIL_TAKEN / PHONE_TAKEN). The one rule checked here first is
 * "email or phone", so the admin sees it before sending.
 */
export function InstructorForm({
  initial,
  askPassword = false,
  submitLabel,
  pending,
  error,
  onSubmit,
}: {
  initial?: Partial<InstructorFormValues>;
  askPassword?: boolean;
  submitLabel: string;
  pending: boolean;
  error: AppError | null;
  onSubmit: (values: InstructorFormValues) => void;
}) {
  const [values, setValues] = useState<InstructorFormValues>({
    name: initial?.name ?? '',
    email: initial?.email ?? '',
    phone: initial?.phone ?? '',
    temporaryPassword: '',
  });
  const [missingLogin, setMissingLogin] = useState(false);
  const fieldErrors = error?.fieldErrors ?? {};

  const set = (field: keyof InstructorFormValues) => (value: string) =>
    setValues((current) => ({ ...current, [field]: value }));

  function submit(event: FormEvent) {
    event.preventDefault();
    const trimmed = {
      name: values.name.trim(),
      email: values.email.trim(),
      phone: values.phone.trim(),
      temporaryPassword: values.temporaryPassword,
    };
    const noLogin = !trimmed.email && !trimmed.phone;
    setMissingLogin(noLogin);
    if (!noLogin) onSubmit(trimmed);
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
      <FormField
        label="الاسم"
        name="name"
        autoComplete="off"
        required
        value={values.name}
        onChange={(e) => set('name')(e.target.value)}
        error={fieldErrors.name}
      />
      <FormField
        label="الايميل"
        name="email"
        type="email"
        dir="ltr"
        autoComplete="off"
        className="text-start"
        value={values.email}
        onChange={(e) => set('email')(e.target.value)}
        error={(missingLogin && EMAIL_OR_PHONE) || fieldErrors.email}
      />
      <FormField
        label="رقم الموبايل"
        name="phone"
        type="tel"
        dir="ltr"
        autoComplete="off"
        className="text-start"
        hint="الايميل او الموبايل هو اللي المدرس هيدخل بيه"
        value={values.phone}
        onChange={(e) => set('phone')(e.target.value)}
        error={(missingLogin && EMAIL_OR_PHONE) || fieldErrors.phone}
      />

      {askPassword && (
        <div className="flex flex-col gap-2">
          <FormField
            label="كلمة سر مؤقتة"
            name="temporaryPassword"
            type="text"
            dir="ltr"
            autoComplete="off"
            spellCheck={false}
            className="text-start font-mono"
            hint="8 حروف على الاقل. ابعتها للمدرس، وهو هيغيرها اول ما يدخل."
            required
            value={values.temporaryPassword}
            onChange={(e) => set('temporaryPassword')(e.target.value)}
            error={fieldErrors.temporaryPassword}
          />
          <Button
            variant="outline"
            className="self-start"
            onClick={() => set('temporaryPassword')(generateTemporaryPassword())}
          >
            <KeyRoundIcon aria-hidden="true" />
            اعمل كلمة سر
          </Button>
        </div>
      )}

      {error && <Alert variant="danger">{error.message}</Alert>}

      <Button type="submit" className="self-start" loading={pending}>
        {submitLabel}
      </Button>
    </form>
  );
}
