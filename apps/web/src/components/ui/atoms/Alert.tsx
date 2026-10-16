import type { ReactNode } from 'react';

/** An error message that screen readers announce as soon as it appears (role="alert"). */
export function Alert({ children }: { children: ReactNode }) {
  return (
    <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
      {children}
    </p>
  );
}
