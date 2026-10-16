import { http } from '@/lib/http';
import type { ChangePasswordRequest, LoginInput, Me } from '../types';

// The auth endpoints (openapi.yaml, tag Auth), as plain functions over the http client.
// Components never call them; the hooks in ../hooks do.

/** POST /auth/login: the API sets the httpOnly auth cookies and returns the user. */
export function login(input: LoginInput): Promise<Me> {
  return http.post<Me>('/auth/login', input);
}

/** POST /auth/logout: revokes the session and clears the cookies. */
export function logout(): Promise<void> {
  return http.post<void>('/auth/logout');
}

/**
 * POST /auth/change-password: on success the API sets new auth cookies for this device and
 * ends every other session of the user.
 */
export function changePassword(input: ChangePasswordRequest): Promise<void> {
  return http.post<void>('/auth/change-password', input);
}

/** GET /auth/me: who is signed in (401 UNAUTHENTICATED when nobody is). */
export function getMe(signal?: AbortSignal): Promise<Me> {
  return http.get<Me>('/auth/me', { signal });
}
