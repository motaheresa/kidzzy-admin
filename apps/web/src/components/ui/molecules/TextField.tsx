import type { InputHTMLAttributes } from 'react';
import { Input } from '../atoms/Input';

/**
 * A labelled input: the <label> wraps the text and the input, so clicking the text focuses the
 * field and screen readers (and getByLabelText in tests) find the input by its label.
 */
export function TextField({
  label,
  ...inputProps
}: InputHTMLAttributes<HTMLInputElement> & { label: string }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-sm">{label}</span>
      <Input {...inputProps} />
    </label>
  );
}
