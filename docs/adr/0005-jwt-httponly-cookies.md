# ADR-0005: Authentication with JWT in httpOnly cookies

- Status: Accepted
- Date: 2026-10-14

## Context

Staff log in from browsers and phones; tokens must not be readable by JavaScript.

## Decision

Access token (15 minutes) and rotating refresh token (7 days) in httpOnly, Secure, SameSite=Strict cookies. The web server serves the SPA and proxies /api on the same domain, so no CORS. Passwords hashed with argon2.

## Alternatives considered

- Tokens in localStorage: exposed to XSS.
- Server-side sessions: need a session store.

## Consequences

- Refresh tokens are stored hashed in the database so a deactivated user is logged out at the next refresh.

## Amendment (2026-10-25, SCRUM-54): the life of a session

A _session_ is a **token family**: the refresh tokens issued since one login, which share a `family_id` (the `sid` in the access token). Rotation replaces a token by the next one of the same family; reuse of a used token, or a logout, revokes the whole family.

- **Absolute lifetime.** A session ends 30 days after its login, however often it is refreshed (`SESSION_MAX_AGE_SECONDS`). Every token of a family carries the same `session_expires_at`, copied on rotation, and a token never expires after it; the 7-day idle expiry per token stays. After the end, refresh is 401 `UNAUTHENTICATED` and the user logs in again. (A column copied on rotation is simpler and safer than deriving the end from the family's first token, which would cost a query on every refresh and break if old tokens were ever purged.)
- **Logout works without an access token.** `POST /auth/logout` is `@Public()`: it finds the session from the refresh cookie (hash lookup, then the whole family is revoked) and, when valid, from the access token's `sid`; it always clears the cookies and answers 204. The cookies are SameSite=Strict, so another site cannot make a browser send them.
- **Cookie path.** The refresh cookie's path is `/api/v1/auth`, so the browser sends it to `/auth/refresh` and `/auth/logout` and to no other URL. The cookie from before (path `/api/v1/auth/refresh`) is expired on login, refresh and logout, and refresh uses the working one if a request carries both.
