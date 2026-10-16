import { toast } from 'sonner';
import type { ErrorKind } from './app-error';
import { normalizeError } from './normalize';

/**
 * Kinds the global reporter never toasts:
 * - unauthenticated: the protected layout sends the user to the login page instead
 * - validation: it belongs next to the form fields, so the screen shows it itself
 */
const SILENT_KINDS: ReadonlySet<ErrorKind> = new Set(['unauthenticated', 'validation']);

/** A request the caller cancelled (left the screen, newer query): not an error to report. */
export function isCancellation(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError';
}

/**
 * The global error handler: shows a toast for an error no screen handles itself. The query
 * layer calls it for every query and mutation unless its meta says errorHandling: 'local'.
 * The message is the toast id, so the same failure from several requests shows once.
 */
export function reportError(error: unknown): void {
  if (isCancellation(error)) return;
  const appError = normalizeError(error);
  if (SILENT_KINDS.has(appError.kind)) return;
  toast.error(appError.message, { id: appError.message });
}
