import { useId, type ComponentProps } from 'react';
import { Input } from '../atoms/input';
import { Label } from '../atoms/label';

type FormFieldProps = ComponentProps<typeof Input> & {
  label: string;
  /** Help shown under the field, always. */
  hint?: string;
  /** The field's error, in Arabic (AppError.fieldErrors). */
  error?: string;
};

/**
 * A labelled input with its hint and error. The label points at the input (htmlFor), and the
 * input points at its hint and error (aria-describedby), so screen readers read them with the
 * field; an error also sets aria-invalid.
 */
export function FormField({ label, hint, error, id, ...inputProps }: FormFieldProps) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  const hintId = `${inputId}-hint`;
  const errorId = `${inputId}-error`;
  const describedBy = [hint && hintId, error && errorId].filter(Boolean).join(' ') || undefined;

  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={inputId}>{label}</Label>
      <Input
        id={inputId}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
        {...inputProps}
      />
      {hint && (
        <p id={hintId} className="text-xs text-muted-foreground">
          {hint}
        </p>
      )}
      {error && (
        <p id={errorId} className="text-sm text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
