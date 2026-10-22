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

## Amendment (2026-10-22, SCRUM-24): what scope `own` means for sessions

For groups and students, `own` means the groups the caller teaches now. A session has its own `instructor_id`: copied from the group when the session is generated, and moved to the new instructor only for sessions still ahead when an admin changes the group's instructor (SCRUM-26). So for sessions, scope `own` (`sessions.read:own`) sees a session when the caller is the group's current instructor OR the instructor on the session. After a change of instructor, the former one still sees the sessions they taught, and the new one sees the whole history of the group. With `groupId`, scope `own` is 403 only when the caller is neither the current instructor nor on any session of that group; otherwise the same rule filters the list. Admins (`any`) see everything, and `instructorId=X` returns exactly what X would see.

The rule is written once in TypeScript (`SessionsService.canSeeSession` and `canSeeGroup`) and once as a filter (`SessionRepository`, `visibleToInstructorId`); tests cover both. Any later story that reads or writes a session for scope `own` (held, cancel, reschedule, attendance) starts from the same rule and says in its own pull request if it must be stricter, for example only the current instructor for a session still ahead. This extends the decision above without changing it, so it is a note here rather than a new ADR.
