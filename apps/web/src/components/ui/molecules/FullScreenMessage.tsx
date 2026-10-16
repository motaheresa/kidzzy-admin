import type { ReactNode } from 'react';
import { Spinner } from '../atoms/spinner';

/**
 * A screen-filling state: loading (`busy`), not found, or an error with an action below it.
 * Used while the session loads, so the login form never flashes before a signed-in user.
 */
export function FullScreenMessage({
  title,
  description,
  busy = false,
  children,
}: {
  title: string;
  description?: string;
  busy?: boolean;
  children?: ReactNode;
}) {
  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col items-center justify-center gap-4 p-6 text-center">
      {busy ? (
        <Spinner label={title} className="size-8" />
      ) : (
        <h1 className="font-display text-2xl font-bold text-foreground">{title}</h1>
      )}
      {description && <p className="text-sm text-muted-foreground">{description}</p>}
      {children}
    </main>
  );
}
