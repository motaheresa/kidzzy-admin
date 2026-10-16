import { useState, type FormEvent } from 'react';
import { Alert, Button, FormField, TextareaField } from '@/components/ui';
import type { AppError } from '@/lib/errors';

/** The form's text, as typed. */
export interface StudentFormValues {
  code: string;
  name: string;
  age: string;
  parentName: string;
  parentPhone: string;
  notes: string;
}

/** The values ready for the API: trimmed, age as a number or null, empty notes as null. */
export interface StudentFormResult {
  code: string;
  name: string;
  age: number | null;
  parentName: string;
  parentPhone: string;
  notes: string | null;
}

const EMPTY: StudentFormValues = {
  code: '',
  name: '',
  age: '',
  parentName: '',
  parentPhone: '',
  notes: '',
};

const AGE_NOT_A_NUMBER = 'اكتب السن رقم، او سيبه فاضي';

/**
 * A student's data, for both create and edit (US-05). The API decides what is valid and the
 * form shows its answer under each field (AppError.fieldErrors, including STUDENT_CODE_TAKEN
 * under the code). The code is shown as typed; the API stores it uppercase.
 */
export function StudentForm({
  initial,
  submitLabel,
  pending,
  error,
  onSubmit,
}: {
  initial?: Partial<StudentFormValues>;
  submitLabel: string;
  pending: boolean;
  error: AppError | null;
  onSubmit: (values: StudentFormResult) => void;
}) {
  const [values, setValues] = useState<StudentFormValues>({ ...EMPTY, ...initial });
  const [ageError, setAgeError] = useState<string>();
  const fieldErrors = error?.fieldErrors ?? {};

  const field = (name: keyof StudentFormValues) => ({
    name,
    value: values[name],
    onChange: (event: { target: { value: string } }) =>
      setValues((current) => ({ ...current, [name]: event.target.value })),
  });

  function submit(event: FormEvent) {
    event.preventDefault();
    const ageText = values.age.trim();
    const age = ageText === '' ? null : Number(ageText);
    if (age !== null && Number.isNaN(age)) {
      setAgeError(AGE_NOT_A_NUMBER);
      return;
    }
    setAgeError(undefined);
    onSubmit({
      code: values.code.trim(),
      name: values.name.trim(),
      age,
      parentName: values.parentName.trim(),
      parentPhone: values.parentPhone.trim(),
      notes: values.notes.trim() || null,
    });
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField
          label="الكود"
          dir="ltr"
          autoComplete="off"
          className="text-start uppercase"
          hint="مثال: KC-001"
          required
          {...field('code')}
          error={fieldErrors.code}
        />
        <FormField
          label="السن"
          type="number"
          inputMode="numeric"
          min={3}
          max={25}
          dir="ltr"
          className="text-start"
          hint="اختياري، من 3 لـ 25"
          {...field('age')}
          error={ageError ?? fieldErrors.age}
        />
      </div>
      <FormField
        label="اسم الطالب"
        autoComplete="off"
        required
        {...field('name')}
        error={fieldErrors.name}
      />
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField
          label="اسم ولي الامر"
          autoComplete="off"
          required
          {...field('parentName')}
          error={fieldErrors.parentName}
        />
        <FormField
          label="رقم ولي الامر"
          type="tel"
          dir="ltr"
          autoComplete="off"
          className="text-start"
          required
          {...field('parentPhone')}
          error={fieldErrors.parentPhone}
        />
      </div>
      <TextareaField label="ملاحظات" hint="اختياري" {...field('notes')} error={fieldErrors.notes} />

      {error && <Alert variant="danger">{error.message}</Alert>}

      <Button type="submit" className="self-start" loading={pending}>
        {submitLabel}
      </Button>
    </form>
  );
}
