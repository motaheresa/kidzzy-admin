import { useId, type InputHTMLAttributes } from 'react';
import { Input } from '../atoms/Input';

/**
 * A labelled input: the <label> wraps the text and the input, so clicking the text focuses the
 * field and screen readers (and getByLabelText in tests) find the input by its label.
 * `error` is shown under the field, outside the label (so the label text stays the same), and
 * linked to the input with aria-describedby.
 */
export function TextField({
  label,
  error,
  ...inputProps
}: InputHTMLAttributes<HTMLInputElement> & { label: string; error?: string }) {
  const errorId = `${useId()}-error`;
  return (
    <div className="flex flex-col gap-1">
      <label className="flex flex-col gap-1">
        <span className="text-sm">{label}</span>
        <Input
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? errorId : undefined}
          {...inputProps}
        />
      </label>
      {error && (
        <p id={errorId} className="text-sm text-red-700">
          {error}
        </p>
      )}
    </div>
  );
}
