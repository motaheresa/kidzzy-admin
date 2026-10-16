# ADR-0012: Web data flow

- Status: Accepted
- Date: 2026-10-16
- Relates to: [ADR-0005](0005-jwt-httponly-cookies.md), [ADR-0011](0011-code-structure.md)
- Jira: SCRUM-60

## Context

ADR-0011 split the web app into app, pages, features, ui and lib, but each request still decided for itself how to call the API, what to do on an error and whether the user was signed in. The access token lives 15 minutes and the refresh token rotates on every use (ADR-0005): a refresh token presented twice revokes the whole session, so three requests that each refresh on their own 401 sign the user out. Staff use the app on phones with unreliable connections, and every screen ahead (groups, sessions, payments) needs the same loading, error and session handling.

## Decision

Every screen follows one flow:

```text
route -> layout -> page -> feature component -> feature hook
      -> useApiQuery / useApiMutation (src/lib/query)
      -> feature api function -> http client (src/lib/http)
      -> AppError (src/lib/errors)
```

- **Routes and layouts** (`src/app`, react-router data router). `RootLayout` holds the route error boundary and the toaster. `PublicLayout` sends a signed-in user from `/login` home. `ProtectedLayout` reads the session (`GET /auth/me`): a loader while it loads, `/login?returnTo=<path and query>` when signed out, and a retry screen when the check fails on the network. `returnTo` passes `safeReturnTo` (same origin, no `//`, `/\`, control characters or `/login`), which blocks open redirects. The session is the `['auth', 'me']` query, with `null` meaning signed out.
- **Network layer** (`src/lib/http`). One client, the only code that calls `fetch`. It sends JSON to `/api/v1` with same-origin cookies, combines the caller's AbortSignal with a 15-second timeout, and turns every non-2xx answer into an `AppError`. On 401 `UNAUTHENTICATED`, except on login and refresh, it refreshes once and retries once. Concurrent 401s share one in-flight refresh (single flight), and the refresh runs under a Web Lock so tabs do not race either. A refused refresh emits a session-expired event, a plain subscribe and emit with no React. The app layer answers it by setting the session to `null`, and the protected layout redirects. Retrying a POST is safe because the 401 comes from the global guard, before any handler ran.
- **Query layer** (`src/lib/query`). The only door to TanStack Query for features. `useApiQuery` and `useApiMutation` are typed through TanStack's `Register` (errors are `AppError`, meta is `ApiMeta`). Queries retry at most twice and only on network, timeout and server errors. Mutations never retry. Every failure goes to the global reporter unless `meta.errorHandling` is `'local'`. Query keys come from per-feature factories (`authKeys`).
- **Error layer** (`src/lib/errors`). One `AppError` shape: kind, status, code, Arabic message, field errors and cause. `normalizeError` accepts anything thrown. `ERROR_MESSAGES` is a `Record<ErrorCode, string>`, so a new code without an Arabic message fails the typecheck. The server's `detail` is never shown. `reportError` toasts with sonner, except for unauthenticated (the redirect handles it), validation (the form shows it) and cancelled requests.
- ESLint keeps `fetch` inside `src/lib/http` and `@tanstack/react-query` inside `src/lib/query` and `src/app`.

## Alternatives considered

- Each request refreshing on its own 401: with rotating refresh tokens, concurrent refreshes look like token theft and revoke the session.
- Refreshing on a timer before the access token expires: the timer is wrong after sleep or a closed tab, and the 401 path is still needed.
- Axios with interceptors: another dependency and another error shape for what fetch and about 150 lines do.
- An error per call site: every screen re-invents messages, and some show the server's English `detail`.
- Retrying mutations like queries: a POST that timed out may already be applied, so a retry could record a payment twice.
- A session in React context instead of a query: it duplicates caching, refetching and invalidation that TanStack Query already does.

## Consequences

- A new screen is a route plus a page plus a feature (`api`, `keys`, `hooks`, `components`), and gets loading, errors, retries and the session for free.
- Every error the user sees is Arabic and comes from one dictionary. Adding an error code means adding its message.
- A route handler must never throw 401 `UNAUTHENTICATED` after a side effect, or the automatic retry would repeat it (CLAUDE.md).
- Signed-out visitors of `/login` cause one `GET /auth/me` and one refresh attempt, both 401: expected, and visible in the network tab.
- Deep links in production need the web server to answer unknown non-`/api` paths with `index.html` (deployment, not code).
- The session check is one request per app start, or after 5 minutes of staleness, not one per page.
