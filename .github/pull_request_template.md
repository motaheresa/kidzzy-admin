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

## Definition of Done

- [ ] CI is green (the full suite: lint, typecheck, tests, full e2e, migrations and drift check, build, API spec)
- [ ] `docs/api/openapi.yaml` updated if an endpoint changed
- [ ] Migration added if the schema changed, and it runs on an empty database
- [ ] Audit log and notification side effects checked, where relevant

## Screenshots

<!-- For UI changes: before and after, phone width. -->
