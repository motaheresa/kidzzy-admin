import { ErrorCode } from '@kidzzy/shared';
import { AppError, isAppError, type ErrorKind } from './app-error';
import { ERROR_MESSAGES, FIELD_FALLBACK, FIELD_MESSAGES, KIND_MESSAGES } from './messages';

const KNOWN_CODES = new Set<string>(Object.values(ErrorCode));

function isErrorCode(value: unknown): value is ErrorCode {
  return typeof value === 'string' && KNOWN_CODES.has(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

/** The kind of an API answer: the stable code decides first, then the HTTP status. */
function kindFor(status: number, code: ErrorCode | undefined): ErrorKind {
  switch (code) {
    case ErrorCode.Unauthenticated:
    case ErrorCode.InvalidCredentials:
      return 'unauthenticated';
    case ErrorCode.PasswordChangeRequired:
      // Kept as its own case: the user is signed in but must change the password first (US-02).
      return 'forbidden';
    case ErrorCode.Forbidden:
      return 'forbidden';
    case ErrorCode.NotFound:
      return 'notFound';
    case ErrorCode.ValidationFailed:
      return 'validation';
    case ErrorCode.RateLimited:
      return 'rateLimited';
    case ErrorCode.InternalError:
      return 'server';
  }
  // Business-rule codes (409 / 422) and responses without a known code.
  if (status === 0) return 'network';
  if (status === 400 || status === 422) return 'validation';
  if (status === 401) return 'unauthenticated';
  if (status === 403) return 'forbidden';
  if (status === 404) return 'notFound';
  if (status === 409) return 'conflict';
  if (status === 429) return 'rateLimited';
  if (status >= 500) return 'server';
  return 'unknown';
}

/** "schedule.0.startTime" -> the message for the full key, else its last part, else a fallback. */
function fieldMessage(field: string): string {
  const last = field.split('.').pop() ?? field;
  return FIELD_MESSAGES[field] ?? FIELD_MESSAGES[last] ?? FIELD_FALLBACK;
}

/** VALIDATION_FAILED `errors[]` ({ field, message }) -> Arabic message per field. */
function toFieldErrors(errors: unknown): Record<string, string> {
  if (!Array.isArray(errors)) return {};
  const fieldErrors: Record<string, string> = {};
  for (const item of errors) {
    if (isRecord(item) && typeof item.field === 'string' && !(item.field in fieldErrors)) {
      fieldErrors[item.field] = fieldMessage(item.field);
    }
  }
  return fieldErrors;
}

/**
 * Turns a non-2xx API answer into an AppError. `body` is the parsed Problem Details, or
 * anything else the server or a proxy sent (an HTML 502 page, nothing at all).
 */
export function fromResponse(status: number, body: unknown): AppError {
  const code = isRecord(body) && isErrorCode(body.code) ? body.code : undefined;
  const kind = kindFor(status, code);
  return new AppError({
    kind,
    status,
    code,
    message: code ? ERROR_MESSAGES[code] : KIND_MESSAGES[kind],
    fieldErrors: kind === 'validation' && isRecord(body) ? toFieldErrors(body.errors) : {},
    cause: body,
  });
}

/** The error the http client throws when its own timeout fires. */
export function timeoutError(cause?: unknown): AppError {
  return new AppError({ kind: 'timeout', message: KIND_MESSAGES.timeout, cause });
}

/**
 * Any thrown value -> AppError. Handles AppErrors (returned as they are), Problem Details bodies,
 * fetch's TypeError (network), timeouts, and anything else (unknown, with the value as cause).
 */
export function normalizeError(error: unknown): AppError {
  if (isAppError(error)) return error;

  if (error instanceof DOMException && error.name === 'TimeoutError') return timeoutError(error);

  // fetch rejects with a TypeError when the request cannot be sent at all.
  if (error instanceof TypeError) {
    return new AppError({ kind: 'network', message: KIND_MESSAGES.network, cause: error });
  }

  // A Problem Details object that was thrown as it is.
  if (isRecord(error) && typeof error.status === 'number' && typeof error.code === 'string') {
    return fromResponse(error.status, error);
  }

  return new AppError({ kind: 'unknown', message: KIND_MESSAGES.unknown, cause: error });
}
