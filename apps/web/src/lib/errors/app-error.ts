import type { ErrorCode } from '@kidzzy/shared';

/** What went wrong, from the user's point of view. Screens and the global reporter branch on it. */
export const ERROR_KINDS = [
  'network', // the request never reached the API (offline, DNS, CORS, server down)
  'timeout', // no answer within the client timeout
  'unauthenticated', // 401: not signed in, session expired, or wrong credentials
  'forbidden', // 403: signed in but not allowed
  'validation', // 400 / 422: the input was refused
  'notFound', // 404
  'conflict', // 409: breaks a business rule in the current state
  'rateLimited', // 429
  'server', // 5xx
  'unknown', // anything else, including bugs in our own code
] as const;

export type ErrorKind = (typeof ERROR_KINDS)[number];

export interface AppErrorInit {
  kind: ErrorKind;
  /** Arabic, ready to show. Never the server's `detail`. */
  message: string;
  status?: number;
  code?: ErrorCode;
  fieldErrors?: Record<string, string>;
  cause?: unknown;
}

/**
 * The one error shape of the web app (ADR-0012): every failure, whether a Problem Details
 * response, a network error, a timeout or a bug, reaches screens as an AppError.
 */
export class AppError extends Error {
  readonly kind: ErrorKind;
  readonly status?: number;
  /** The API's stable code, when the API answered with one. */
  readonly code?: ErrorCode;
  /** Arabic message per field, from a VALIDATION_FAILED response. */
  readonly fieldErrors: Record<string, string>;
  /** The original error or response body, for debugging; never shown. */
  readonly cause: unknown;

  constructor(init: AppErrorInit) {
    super(init.message);
    this.name = 'AppError';
    this.kind = init.kind;
    this.status = init.status;
    this.code = init.code;
    this.fieldErrors = init.fieldErrors ?? {};
    this.cause = init.cause;
  }
}

export function isAppError(error: unknown): error is AppError {
  return error instanceof AppError;
}
