import { useId, type ComponentProps } from 'react';
import { Label } from '../atoms/label';
import { Textarea } from '../atoms/textarea';

type TextareaFieldProps = ComponentProps<typeof Textarea> & {
  label: string;
  /** Help shown under the field, always. */
  hint?: string;
  /** The field's error, in Arabic (AppError.fieldErrors). */
  error?: string;
};

/**
 * FormField for multi-line text: a labelled textarea with its hint and error, wired the same
 * way (htmlFor, aria-describedby, aria-invalid on an error).
 */
export function TextareaField({ label, hint, error, id, ...textareaProps }: TextareaFieldProps) {
  const generatedId = useId();
  const fieldId = id ?? generatedId;
  const hintId = `${fieldId}-hint`;
  const errorId = `${fieldId}-error`;
  const describedBy = [hint && hintId, error && errorId].filter(Boolean).join(' ') || undefined;

  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={fieldId}>{label}</Label>
      <Textarea
        id={fieldId}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
        {...textareaProps}
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
