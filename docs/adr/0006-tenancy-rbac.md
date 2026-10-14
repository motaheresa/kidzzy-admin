# ADR-0006: Tenancy and RBAC enforcement

- Status: Accepted
- Date: 2026-10-14

## Context

Every query must be scoped by academy (NFR-01) and every endpoint checked by permission (NFR-02).

## Decision

The JWT carries user and academy ids; nestjs-cls stores them per request; a Prisma client extension adds academy_id to every read and write; PermissionsGuard checks permission keys of the form resource.action:scope, where scope is own or any.

## Alternatives considered

- Passing academy_id by hand in every query: easy to forget once.
- PostgreSQL row-level security: stronger, but more complex for V1.

## Consequences

- Code that must ignore the tenant filter (seed, scheduler) uses an explicit unscoped client.
