# ADR-0007: Background jobs in the API process

- Status: Accepted
- Date: 2026-10-14

## Context

Session generation once a day and reminders checked every minute; one academy, low volume.

## Decision

@nestjs/schedule runs a daily @Cron for session generation and an @Interval(60000) tick that sends due reminder_jobs. Exactly one API instance runs; each job is marked sent in the same transaction that sends it, and a tick picks up anything overdue after a restart.

## Alternatives considered

- A Redis queue such as BullMQ: more infrastructure.
- An external cron service calling an endpoint: needed only on serverless hosting.

## Consequences

- Running two API instances later requires a database lock or a separate worker.
