import type { AppError } from '../errors';

/** `meta` accepted by every query and mutation. */
export interface ApiMeta extends Record<string, unknown> {
  /**
   * 'global' (the default): a failure is shown by the global reporter (a toast).
   * 'local': the screen shows the error itself (a form under its fields), so no toast.
   */
  errorHandling?: 'global' | 'local';
}

// Registers the app's types with TanStack Query (module augmentation): every query and mutation
// error is typed AppError, and `meta` is typed ApiMeta, without repeating the generics everywhere.
declare module '@tanstack/react-query' {
  interface Register {
    defaultError: AppError;
    queryMeta: ApiMeta;
    mutationMeta: ApiMeta;
  }
}
