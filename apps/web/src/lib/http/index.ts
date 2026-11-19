// Network layer (ADR-0012): the one HTTP client, and the session-expired signal.
export { http, refreshSession, REQUEST_TIMEOUT_MS, type RequestOptions } from './client';
export { REFRESH_LOCK } from './refresh';
export { emitSessionExpired, onSessionExpired } from './session-events';
