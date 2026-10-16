import { API_PREFIX } from '@kidzzy/shared';
import type { CookieOptions } from 'express';

/** Token lifetimes from ADR-0005 and API Design V1 ("Cookie flow"). */
export const ACCESS_TOKEN_TTL_SECONDS = 15 * 60;
export const REFRESH_TOKEN_TTL_SECONDS = 7 * 24 * 60 * 60;

export const ACCESS_COOKIE = 'access_token';
export const REFRESH_COOKIE = 'refresh_token';

/** The refresh cookie is sent only to the refresh endpoint, so other requests never carry it. */
export const REFRESH_COOKIE_PATH = `/${API_PREFIX}/auth/refresh`;
export const ACCESS_COOKIE_PATH = '/api';

/** What the access token (a signed JWT) carries. */
export interface AccessTokenPayload {
  /** User id */
  sub: string;
  /** Academy id: the tenant for every query of this request */
  aid: string;
  /** Session id: the refresh-token family started at login, revoked on logout */
  sid: string;
  /**
   * The user's permission keys (resource.action:scope) when the token was issued, at login or the
   * last refresh. PermissionsGuard checks them with no database query, so a role change or a
   * deactivation applies at the next refresh, within ACCESS_TOKEN_TTL_SECONDS (ADR-0013).
   */
  perms: string[];
  /**
   * The user must replace a temporary password (US-02). While it is true, PermissionsGuard only
   * lets the routes marked @AllowedDuringPasswordChange() through. Written from the user row at
   * login and at every refresh, like perms.
   */
  mustChangePassword: boolean;
}

/** True when a verified JWT payload has the shape the app issues (anything else is invalid). */
export function isAccessTokenPayload(value: unknown): value is AccessTokenPayload {
  if (typeof value !== 'object' || value === null) return false;
  const { sub, aid, sid, perms, mustChangePassword } = value as Record<string, unknown>;
  return (
    typeof sub === 'string' &&
    typeof aid === 'string' &&
    typeof sid === 'string' &&
    Array.isArray(perms) &&
    perms.every((key) => typeof key === 'string') &&
    typeof mustChangePassword === 'boolean'
  );
}

/** httpOnly: no JavaScript access. SameSite=Strict: never sent by another site's page. */
export function cookieOptions(
  secure: boolean,
  path: string,
  maxAgeSeconds?: number,
): CookieOptions {
  const options: CookieOptions = { httpOnly: true, secure, sameSite: 'strict', path };
  if (maxAgeSeconds !== undefined) options.maxAge = maxAgeSeconds * 1000;
  return options;
}
