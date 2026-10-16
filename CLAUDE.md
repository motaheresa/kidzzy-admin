# CLAUDE.md

Context for Claude Code sessions in this repository. Read it before changing anything.

## The project

Academy management system for KidzzyCoders, an online kids' coding academy in Egypt. V1 serves this one academy; the data model is multi-tenant so V3 can sell it to other academies as SaaS. It is not a registration system: it manages instructors, students, groups, sessions, attendance, payment cycles, reminders and notifications.

The design documents are linked from `docs/README.md` (PRD, SRS, user flows, wireframes, ERD, backlog, architecture, API design). Decisions are in `docs/adr/`, and the API contract is `docs/api/openapi.yaml`. When code and documents disagree, ask before choosing.

## Private evidence

`private_evidence/` at the repository root is local only: it is in `.gitignore`, `.prettierignore`, both ESLint ignores and the TypeScript excludes, and `.husky/pre-commit` refuses any commit that stages a path under it.

- It holds the original design documents (`project-docs/`, with its own `README.md`), brand notes (`brand-notes.md`) and brand assets (`KC Academy/`: logo, posters, reels).
- It is reference only. Never copy it into the app, except an asset chosen on purpose (for example the logo), which then lives under `apps/web` like any other source file.
- When it disagrees with the repository, the repository wins: ADRs, `openapi.yaml`, the Prisma schema and migrations, and this file.

## Stack and layout

pnpm monorepo (`pnpm-workspace.yaml`):

- `apps/api`: NestJS 11 modular monolith, Prisma 7, PostgreSQL 16, class-validator DTOs. One module per domain under `src/modules/`. `src/app.setup.ts` holds the global config shared by `main.ts` and the e2e tests.
- `apps/web`: React 19 + Vite + Tailwind CSS 4 PWA, Arabic and right-to-left. In development, Vite proxies `/api` to `localhost:3000`, so the app is same-origin like production.
- `packages/shared`: enums, error codes and API types used by both apps, built as ESM and CJS. No runtime logic and no dependencies.

Production: one InterServer server managed with Webuzo, the API under PM2, at app.kidzzy-coders.com. No Docker anywhere on the developer's side (ADR-0010).

## Developer machine

Windows 10 with PowerShell, Node 22, pnpm 10 and a native PostgreSQL 16 install. Write commands for PowerShell. Never add Docker. The local database and `apps/api/.env` are set up by the developer, and `.env` is never committed.

## Commands

| Command                                    | Purpose                                  |
| ------------------------------------------ | ---------------------------------------- |
| `pnpm dev`                                 | API (3000) and web (5173) in watch mode  |
| `pnpm lint` / `pnpm typecheck`             | ESLint / TypeScript across the workspace |
| `pnpm test` / `pnpm test:e2e`              | Unit tests / API e2e tests (need the DB) |
| `pnpm build`                               | Production builds                        |
| `pnpm format:check`                        | Prettier check, same as CI               |
| `pnpm lint:api-spec`                       | Validate `docs/api/openapi.yaml`         |
| `pnpm --filter @kidzzy/api prisma:migrate` | Create and apply a migration             |
| `pnpm --filter @kidzzy/api prisma:seed`    | Seed permissions, academy and roles      |

Run lint, typecheck and the tests before saying a change is done.

## Data access

- Inject `PrismaService` and use `prisma.db`: queries on every model with `academyId` are limited to the academy in `TenantContext`, and throw `MissingTenantContextError` when there is none.
- `prisma.unscoped` crosses academies; use it only for the seed, background jobs and the login lookup, and say why in the pull request.
- On create, still pass `academyId: tenant.requireAcademyId()`: the generated types require it, and the extension rejects any other academy.
- Raw SQL is never scoped automatically; filter by `academy_id` yourself.
- Code outside an HTTP request (jobs, tests) wraps its work in `tenant.run(academyId, fn)`.
- Constraints Prisma cannot express (check constraints, partial unique indexes) go as custom SQL at the end of the migration, created with `prisma migrate dev --create-only`.
- Every email or phone that is written or looked up goes through `normalizeEmail` / `normalizePhone` (`src/common/normalize`); the database rejects any other form. Never match them with `mode: 'insensitive'`: Prisma sends it as `ILIKE`, where `%` and `_` are wildcards.

## Auth and errors

- Every route requires a login through the global `JwtAuthGuard`; mark the exceptions with `@Public()`. The guard fills `TenantContext` from the access token, which is what scopes `prisma.db`.
- Signed-in handlers read the caller from `req.auth` (`AuthenticatedRequest`): `userId`, `academyId`, `sessionId`.
- Throw `AppException(ErrorCode.X, HttpStatus.Y, detail)` for errors the client acts on; `ProblemDetailsFilter` turns every error into RFC 9457 with a stable `code`. Never leak internal messages in `detail`.
- Environment variables are validated at startup in `src/common/config/env.validation.ts`; add a new variable there first and read it with `ConfigService`, which returns the typed value. Tests never change `process.env` at runtime; `createTestApp` takes overrides instead.
- App code logs through Nest's `Logger`, never `console` (ESLint `no-console`).
- Tokens only travel as httpOnly cookies; no endpoint returns a token in a body.

## API conventions

- Base path `/api/v1`, JSON in camelCase, UUID ids, UTC ISO 8601 timestamps, money as decimal strings in EGP.
- Lists: offset pagination returning `{ data, meta }`.
- Errors: RFC 9457 Problem Details with a stable `code` from `ErrorCode` in `packages/shared`.
- State changes are action endpoints, for example `POST /sessions/{id}/held`, `/cancel`, `/reschedule`, `/undo-held`.
- Auth: JWT access and refresh tokens in httpOnly, SameSite=Strict cookies; passwords hashed with argon2.
- Every tenant table has `academy_id`; tenant scoping is applied through nestjs-cls and a Prisma extension, never by hand in each query.
- Permissions are keys shaped `resource.action:scope`, with scope `own` or `any`.
- Design-first: change `openapi.yaml` in the same pull request as the endpoint.

## Business rules to protect

- A session is `scheduled`, `held` or `cancelled`. Only held sessions get a number. A cancelled session takes no number, and the next held session takes it.
- A student's payment cycle counts the group's held sessions, even when the student was absent. An instructor's cycle counts held sessions in their groups.
- A cycle becomes due when it reaches the plan's session count. There are no partial payments. A plan change applies from the next cycle. Moving a student to another group keeps their current cycle.
- An optional starting count applies to the first cycle only.
- Ratings are 1 to 5 stars. A homework rating of null means there was no homework. Absent students cannot be rated.
- Only the admin can undo a held session, with no time limit.

Each of these needs a test when the code that enforces it is written.

## Workflow

Work is tracked in Jira project `SCRUM`; full rules are in `CONTRIBUTING.md`.

- Never commit to `main`; it is protected, and every change reaches it through a pull request with green CI and a squash merge.
- Branch: `<type>/SCRUM-<n>-<short-description>`, for example `feature/SCRUM-20-create-group`.
- Commits: Conventional Commits with a scope from `commitlint.config.mjs` and the Jira key at the end, for example `feat(groups): create a group with a weekly schedule (SCRUM-20)`.
- One story per pull request, using the template in `.github/pull_request_template.md`.
- A schema change adds a Prisma migration in the same pull request. Never edit an applied migration; add a new one.
- To change an accepted ADR, add a new ADR that amends or supersedes it.

## Working with the developer

The developer is learning NestJS and backend engineering through this project. Explain each change as you make it, using the proper technical terms and defining the harder ones. Keep explanations focused on the topic and skip low-level tangents. Let the developer do setup steps such as creating the database or running migrations themselves, and explain what each step does.
