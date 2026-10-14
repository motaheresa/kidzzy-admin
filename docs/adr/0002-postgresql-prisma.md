# ADR-0002: PostgreSQL with Prisma

- Status: Accepted
- Date: 2026-10-14

## Context

The ERD relies on partial unique indexes, enums and check constraints.

## Decision

PostgreSQL 16 accessed through Prisma 7. Constraints Prisma cannot express are added as raw SQL inside Prisma migrations.

## Alternatives considered

- MySQL: already on the server, but has no partial unique indexes.
- TypeORM: weaker typing, more runtime surprises.

## Consequences

- Some constraints live only in SQL migration files and must be reviewed there.
