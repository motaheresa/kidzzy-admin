import type { ReactNode } from 'react';
import { Spinner } from '../atoms/Spinner';

/**
 * A screen-filling state: loading (`busy`), not found, or an error with an action below it.
 * Used while the session loads, so the login form never flashes before a signed-in user.
 */
export function FullScreenMessage({
  title,
  busy = false,
  children,
}: {
  title: string;
  busy?: boolean;
  children?: ReactNode;
}) {
  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col items-center justify-center gap-4 p-6 text-center">
      {busy ? <Spinner label={title} /> : <h1 className="text-xl font-semibold">{title}</h1>}
      {children}
    </main>
  );
}
