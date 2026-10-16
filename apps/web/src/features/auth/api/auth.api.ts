import { api } from '../../../lib/api';
import type { LoginInput, Me } from '../types';

// The auth endpoints (openapi.yaml, tag Auth). Plain functions over the API client; components
// never call them directly, the hooks in ../hooks do.

/** Logs in; the API sets the httpOnly auth cookies and returns the user. */
export function login(input: LoginInput): Promise<Me> {
  return api<Me>('/auth/login', { method: 'POST', body: input });
}

/** Revokes the session and clears the cookies. */
export function logout(): Promise<void> {
  return api<void>('/auth/logout', { method: 'POST' });
}
