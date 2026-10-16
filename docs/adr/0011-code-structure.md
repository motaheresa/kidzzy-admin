# ADR-0011: Code structure

- Status: Accepted
- Date: 2026-10-16
- Relates to: [ADR-0001](0001-modular-monolith-nestjs.md), [ADR-0003](0003-react-vite-pwa.md), [ADR-0006](0006-tenancy-rbac.md)
- Jira: SCRUM-58

## Context

Two stories in, `AuthService` mixed business rules with Prisma queries and built API responses by hand, and the web login page called the API directly. Upcoming stories add a dozen modules (groups, sessions, attendance, payment cycles) whose business rules touch several tables at once, for example marking a session held numbers it and counts every affected payment cycle. Those rules need one place to live, writes that succeed or fail together, and a layout that one developer, and later others, can follow without re-deciding it per story. Tenant isolation (ADR-0006) must hold inside transactions too.

## Decision

**API.** Each NestJS module has three layers. Controllers take a request DTO from the module's `dto/` (input shape only) and return what the service returns. Services hold the business rules and throw `AppException` (409 when the current state breaks a rule, 422 when values contradict each other); no class-validator rule queries the database. Repositories, one per aggregate (`UserRepository`, `RefreshTokenRepository`), are the only classes that query: their methods are named by intent (`findLoginCandidates`, `revokeSession`), with no generic base repository. Scoped queries go through `TransactionHost.tx` from `@nestjs-cls/transactional`, whose Prisma adapter opens transactions on the tenant-scoped client `prisma.db`, so a service method marked `@Transactional()` runs every repository call in one transaction that still sees only the current academy. `prisma.unscoped` appears only in repository methods whose name and comment say why: the login lookup and the refresh-token lookup, before any academy is known. Responses are built by mapper functions in each module (`toMe`), never by returning Prisma rows. ESLint refuses a Prisma import outside `*.repository.ts` and the prisma module.

**Web.** `src/app` holds the providers (TanStack Query's `QueryClientProvider`) and the app shell; `src/pages` has one component per screen, composing features; `src/features/<feature>/` has `api` (functions over the API client), `hooks` (TanStack Query `useQuery` / `useMutation` over those functions), `components` and `types`, and an `index.ts` that is its only public entry; `src/components/ui/{atoms,molecules}` holds shared UI that knows nothing about features; `src/lib` holds the API client and utilities. Components never call the API; hooks do. `eslint-plugin-boundaries` enforces the direction: app → pages → features → ui → lib, a feature reaches another feature only through its index, and ui never imports features.

## Alternatives considered

- Services calling `prisma.db` directly, as before: fewer files, but rules and queries tangle, a query cannot be reused or tested on its own, and nothing stops a service from reaching `prisma.unscoped`.
- A generic base repository (`findById`, `update`…): hides the intent of each query and invites callers to build queries themselves, which is where a tenant or business rule slips.
- Passing a transaction client through every method (`tx` parameters) or using `prisma.$transaction` in services: the transaction leaks into every signature, and services touch Prisma again.
- PostgreSQL row-level security instead of the extension inside transactions: still rejected for V1, as in ADR-0006.
- Web data fetching with `useEffect` and local state: every screen re-implements loading, errors, caching and refetching; TanStack Query does it once.
- `no-restricted-imports` patterns for the web boundaries: they match import strings, and relative imports such as `../../auth/hooks` do not say which layer they reach; the boundaries plugin resolves the imported file and classifies it.

## Consequences

- Each new module follows the same recipe: `dto/`, `<name>.repository.ts`, `<name>.service.ts`, `<name>.mapper.ts`, controller, and an e2e test of its rules. Each new screen is a page plus a feature folder.
- Multi-table rules (held sessions, payment cycles) get atomic writes by adding `@Transactional()`; the e2e test in `test/transactions.e2e-spec.ts` guards that transactions stay tenant-scoped and roll back as one.
- A write that must survive the request failing (revoking a session on token reuse) stays outside the transaction; the service decides where the boundary is.
- More files per feature, and two lint rules to satisfy; a boundary violation is a lint error in CI rather than a review comment.
- shadcn/ui components (ADR-0003), when added, live in `src/components/ui` like the atoms and molecules.
