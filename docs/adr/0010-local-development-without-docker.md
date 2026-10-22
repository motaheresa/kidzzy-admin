# ADR-0010: Local development without Docker

- Status: Accepted
- Date: 2026-10-15
- Amends: [ADR-0009](0009-deployment-webuzo.md)
- Jira: SCRUM-52

## Context

ADR-0009 planned Docker for local development only. Docker Desktop needs several gigabytes of disk space on the developer's Windows machine, and the database is the only service it would run.

## Decision

Local development uses a native PostgreSQL 16 install, running as a Windows service, with the user and database created once as described in the README. `docker-compose.yml` and the `db:up` / `db:down` scripts are removed. CI keeps its Postgres service container, which runs on GitHub's runner and needs nothing on the developer's machine.

## Alternatives considered

- Docker Desktop: too much disk space for a single database.
- A hosted development database (such as a free Neon project): needs internet for every run and adds latency to tests.

## Consequences

- Local development and CI run PostgreSQL 16 without containers on the developer's side. Production is PostgreSQL 18 on the VPS (ADR-0014).
- Each developer installs PostgreSQL once; the README has the steps.
- If Redis or another service is added later, this decision is revisited.
