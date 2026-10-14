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
