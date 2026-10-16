# ADR-0013: Permissions carried in the access token

- Status: Accepted
- Date: 2026-10-16
- Relates to: [ADR-0005](0005-jwt-httponly-cookies.md), [ADR-0006](0006-tenancy-rbac.md)
- Jira: SCRUM-15

## Context

ADR-0006 decided that a PermissionsGuard checks a `resource.action:scope` key on every endpoint. Almost every request of the app will need that check, and the API runs as a single instance on a shared server (ADR-0009). The access token already lives only 15 minutes and is replaced by a refresh (ADR-0005), and the refresh already reads the user from the database to refuse a deactivated one.

## Decision

Login and every refresh write the user's current permission keys into the access token as the claim `perms`, read from the user's roles at that moment. `PermissionsGuard` checks the route's `@RequirePermission('resource.action')` against those keys, with no database query: `:any` or `:own` lets the caller in, and the service asks `AccessContext.scopeFor()` which one applies. A role change, a removed permission or a deactivation therefore applies at the next refresh, within the access token's 15 minutes. `GET /auth/me` and the refresh refuse an inactive user at once. A token without `perms` is invalid (401).

## Alternatives considered

- A database lookup on every request (user, roles, permissions): always current, but one or more queries on every call for a delay nobody needs in an academy back office, and the most load-sensitive part of the shared server.
- A cache of permissions per user with invalidation on role changes: current within seconds, but another moving part (invalidation on every role and permission write, and across instances later).
- A server-side session store: the stateless access token is what ADR-0005 chose.

## Consequences

- Permission checks cost nothing per request, and a deactivated user is signed out within 15 minutes, at the latest at the next refresh.
- The access cookie grows with the number of keys: about 1 KB for the Admin's 21 keys, and an e2e test keeps it under 2 KB (the browser limit is 4 KB). If the catalog grows a lot, the claim can switch to short codes.
- Anything that must take effect at once (for example a security incident) revokes the user's sessions instead of waiting for the refresh.

## Amendment (2026-10-17, SCRUM-16): the mustChangePassword claim

The same mechanism carries one more claim. Login and every refresh write `mustChangePassword` from the user row, and a token without it is invalid (401). While it is true, `PermissionsGuard` answers 403 `PASSWORD_CHANGE_REQUIRED` to every non-public route except the three marked `@AllowedDuringPasswordChange()`: `GET /auth/me`, `POST /auth/logout` and `POST /auth/change-password`. Still no database query per request. An admin's password reset revokes every session of the instructor, so no device keeps a token without the flag beyond its 15 minutes; a change of password revokes them too and gives the current device a new session. `test/route-declarations.e2e-spec.ts` pins the list of allowed routes. This extends the decision above without changing it, so it is a note here rather than a new ADR.
