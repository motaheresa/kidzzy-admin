import type { ButtonHTMLAttributes } from 'react';

const VARIANTS = {
  /** The main action of a screen: dark, filled. */
  primary: 'rounded-lg bg-neutral-900 px-4 py-2 font-medium text-white disabled:opacity-60',
  /** A secondary action: outlined. */
  secondary: 'rounded-lg border border-neutral-300 px-4 py-2 text-sm',
} as const;

export type ButtonVariant = keyof typeof VARIANTS;

/** The app's button. Behaves like <button>; `variant` picks the look. */
export function Button({
  variant = 'primary',
  className,
  type = 'button',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant }) {
  return (
    <button
      type={type}
      className={className ? `${VARIANTS[variant]} ${className}` : VARIANTS[variant]}
      {...props}
    />
  );
}
