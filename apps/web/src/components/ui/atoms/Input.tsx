import type { InputHTMLAttributes } from 'react';

const BASE = 'rounded-lg border border-neutral-300 bg-white px-3 py-2';

/** The app's text input. Behaves like <input>; extra classes are added after the base ones. */
export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={className ? `${BASE} ${className}` : BASE} {...props} />;
}
