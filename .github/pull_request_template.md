## Story

<!-- Jira key and title, e.g. SCRUM-20 US-07 Create a group with a weekly schedule -->

Closes SCRUM-

## What changed

<!-- One or two sentences. Why it was needed is in the story. -->

## Acceptance criteria

<!-- Copy them from the story and tick each one this PR satisfies. -->

- [ ]

## How it was tested

<!-- Local checks: lint, typecheck, format:check, unit tests, lint:api-spec if the spec changed, and the e2e specs of the modules touched. The full e2e, the build and the drift check are CI's job: say so here. -->

- [ ] Unit tests (`pnpm test`)
- [ ] e2e specs of the modules touched, on the local database
- [ ] `pnpm lint`, `pnpm typecheck`, `pnpm format:check` (and `pnpm lint:api-spec` if the spec changed)
- [ ] Tried in the browser at phone width, Arabic RTL

## Production impact

<!-- Required. Production holds real data and merging applies every new migration to it automatically; CI only tests migrations on an empty database. If the PR adds no migration, write "No migration". Otherwise state one of:
- SAFE: only adds tables, nullable columns, indexes or constraints that existing rows already satisfy. No action needed.
- ACTION BEFORE MERGE: could fail or behave differently on existing rows (a NOT NULL column, a new CHECK or unique, a data backfill, a type change). Say what could happen and what to do first (a pg_dump, a check query on production).
- DESTRUCTIVE: drops or rewrites existing data (a dropped column or table, an UPDATE or DELETE of rows). Say exactly what is lost; take a pg_dump before merging. -->

## Definition of Done

- [ ] CI is green (the full suite: lint, typecheck, tests, full e2e, migrations and drift check, build, API spec)
- [ ] `docs/api/openapi.yaml` updated if an endpoint changed
- [ ] Migration added if the schema changed, it runs on an empty database and on one that already has rows, and its production impact is stated above
- [ ] Audit log and notification side effects checked, where relevant

## Screenshots

<!-- For UI changes: before and after, phone width. -->
