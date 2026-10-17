import { useId, type ComponentProps } from 'react';
import { Label } from '../atoms/label';
import { Select } from '../atoms/select';

type SelectFieldProps = ComponentProps<typeof Select> & {
  label: string;
  /** Help shown under the field, always. */
  hint?: string;
  /** The field's error, in Arabic (AppError.fieldErrors). */
  error?: string;
};

/**
 * FormField for a choice: a labelled select with its hint and error, wired the same way
 * (htmlFor, aria-describedby, aria-invalid on an error). Pass the <option>s as children.
 */
export function SelectField({
  label,
  hint,
  error,
  id,
  children,
  ...selectProps
}: SelectFieldProps) {
  const generatedId = useId();
  const fieldId = id ?? generatedId;
  const hintId = `${fieldId}-hint`;
  const errorId = `${fieldId}-error`;
  const describedBy = [hint && hintId, error && errorId].filter(Boolean).join(' ') || undefined;

  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={fieldId}>{label}</Label>
      <Select
        id={fieldId}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
        {...selectProps}
      >
        {children}
      </Select>
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
