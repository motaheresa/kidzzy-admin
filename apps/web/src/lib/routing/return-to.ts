export const LOGIN_PATH = '/login';
export const HOME_PATH = '/';
/** Where a user with a temporary password must go first (US-02). */
export const CHANGE_PASSWORD_PATH = '/change-password';

// Control characters (C0, DEL, C1) and whitespace. Browsers silently drop tabs and newlines from
// URLs, so "/\t/evil.com" would turn into "//evil.com", another site.
// eslint-disable-next-line no-control-regex
const UNSAFE_CHARACTERS = /[\u0000- \u007f-\u009f]/;

/**
 * The page to open after login, from the `returnTo` query parameter, or "/" when it is missing
 * or not safe. Only a path on this site is accepted (open-redirect protection): it must start
 * with "/" but not "//" or "/\" (both mean another host), contain no backslash, control
 * character or space, stay on this origin once parsed, and not be the login page itself.
 */
export function safeReturnTo(
  raw: string | null | undefined,
  origin: string = window.location.origin,
): string {
  if (!raw || !raw.startsWith('/') || raw.startsWith('//') || raw.startsWith('/\\')) {
    return HOME_PATH;
  }
  if (raw.includes('\\') || UNSAFE_CHARACTERS.test(raw)) return HOME_PATH;

  let url: URL;
  try {
    url = new URL(raw, origin);
  } catch {
    return HOME_PATH;
  }
  if (url.origin !== origin || url.pathname === LOGIN_PATH) return HOME_PATH;
  return `${url.pathname}${url.search}${url.hash}`;
}

/** "/login?returnTo=<the current path and query>", for the protected layout's redirect. */
export function loginPathFor(location: { pathname: string; search: string }): string {
  const returnTo = `${location.pathname}${location.search}`;
  return `${LOGIN_PATH}?${new URLSearchParams({ returnTo }).toString()}`;
}

/** "/change-password?returnTo=<the current path and query>", for a temporary password. */
export function changePasswordPathFor(location: { pathname: string; search: string }): string {
  const returnTo = `${location.pathname}${location.search}`;
  return `${CHANGE_PASSWORD_PATH}?${new URLSearchParams({ returnTo }).toString()}`;
}
