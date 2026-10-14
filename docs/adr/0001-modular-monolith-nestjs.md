# ADR-0001: Modular monolith on NestJS

- Status: Accepted
- Date: 2026-10-14

## Context

One developer, one academy in V1, a product to sell in V3; RBAC and many business rules.

## Decision

A single NestJS application split into feature modules (one per epic area). Modules call each other only through exported services; cross-module work inside one business rule uses a direct call in the same transaction, and follow-up work uses domain events after commit.

## Alternatives considered

- Express with a hand-made structure: faster to start, but structure depends on discipline.
- Next.js full-stack: long-running jobs fit poorly.
- Microservices: deployment and debugging cost far beyond V1.

## Consequences

- Learning curve for NestJS.
- Module boundaries allow a module to be split out later if ever needed.
