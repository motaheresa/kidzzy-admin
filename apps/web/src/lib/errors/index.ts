// Error layer (ADR-0012): one AppError for every failure, Arabic messages, one global reporter.
export { AppError, ERROR_KINDS, isAppError, type AppErrorInit, type ErrorKind } from './app-error';
export { ERROR_MESSAGES, FIELD_FALLBACK, FIELD_MESSAGES, KIND_MESSAGES } from './messages';
export { fromResponse, normalizeError, timeoutError } from './normalize';
export { isCancellation, reportError } from './report';
