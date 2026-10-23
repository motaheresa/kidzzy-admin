# ADR-0015: Instructor payment per group

- Status: Accepted
- Date: 2026-10-23
- Supersedes: the instructor part of BR-07 and of the cycle model in the ERD V1 (one plan and one cycle line per instructor, across all their groups)
- Relates to: [ADR-0002](0002-postgresql-prisma.md), [ADR-0006](0006-tenancy-rbac.md)
- Jira: SCRUM-72 (builds on SCRUM-34 and SCRUM-38)

## Context

The first design paid an instructor on one line for all the groups they teach: one plan (N sessions per cycle for an amount), one cycle counter, and a Held session counted into it whatever its group (BR-07, SCRUM-34, SCRUM-38). The academy owner pays differently: an instructor is paid **per group**. One group may pay after 8 sessions and another after 4, each with its own amount. Students are unchanged: one plan line and one cycle line per student, wherever they study (BR-11).

This had to change before real data was entered, because a cycle that mixes groups cannot be split afterwards, and before the payment stories (SCRUM-40, SCRUM-48, SCRUM-49) were built on it.

## Decision

A plan and a cycle of an **instructor** belong to an **(instructor, group) pair**.

- **Plans**: `payment_plans` gets `group_id`. Versions are numbered per pair (`UNIQUE (instructor_id, group_id, version)`). A change applies from that pair's next cycle (BR-10), and the starting point (BR-14) exists only on the pair's first plan. The first plan of a pair needs the instructor to be the group's current instructor (`422 INSTRUCTOR_NOT_IN_GROUP`); later versions are allowed while the pair has cycles, even if the instructor has left the group.
- **Cycles**: `payment_cycles` gets `group_id`. At most one cycle is in progress per pair (a partial unique index on `(instructor_id, group_id)` where `status = 'in_progress'`), and cycles are numbered per pair (`UNIQUE (instructor_id, group_id, cycle_number)`).
- **The group reference** is a composite foreign key through a mirror column, like `sessions.slot_id`: `group_id` with `group_academy_id`, `FOREIGN KEY (group_id, group_academy_id) REFERENCES groups (id, academy_id)`. A CHECK sets the group exactly when `payee_type = 'instructor'`, sets the mirror together with it, and makes it equal `academy_id`. A student's rows have no group.
- **Counting** (US-22): a Held session counts in the open cycle of (the instructor on the session, the session's group), and in each enrolled student's cycle as before. It is never counted in the same instructor's cycles for other groups. Locking, re-reading after the lock and the skip with a warning when there is no open cycle are unchanged.
- **No partial payments** (BR-09) when a group changes instructor mid-cycle: the former instructor's cycle for that group stays in progress, takes no new session, and counts again if they return to the group. Nothing is paid early. The new instructor is counted once they have a plan for the group; until then their sessions are skipped with the warning.
- **API**: `POST /instructors/{id}/payment-plans` takes `groupId`. `GET /payment-plans?instructorId=` returns the versions of every group they have a plan for (each carrying `groupId` and `groupName`, ordered by group name then version); `groupId` narrows it to one group. The plan, cycle and `CycleChange` schemas expose `groupId` (null for a student).
- **Migration on existing rows**: an existing instructor plan or cycle cannot be given a group without guessing. The migration therefore starts with a guard that fails clearly (`delete instructor plans and cycles first`) while any exists, and the developer deletes the instructor rows (the test data) before the migration runs.

## Alternatives considered

- **Keep one line per instructor and split the pay in reports**: wrong when the groups have different N or amounts, and a cycle that mixes groups cannot be split later.
- **One plan per instructor with a per-group override**: two places for the same fact, and the cycle still has to be per group.
- **Guess the group of the existing rows (for example the instructor's current group)**: invents data about money. A guard and a manual delete are honest while production holds only test data.
- **`GET /payment-plans` grouped as `{ groups: [{ group, versions }] }`**: a different shape for students and instructors. A flat list with the group on each plan keeps one shape, and the screen groups by `groupId`, including a group the instructor no longer teaches.

## Consequences

- An instructor who teaches three groups has three plans and three cycle lines; the screens that list cycles and payments (SCRUM-48, SCRUM-49) show the group next to the instructor.
- An instructor's plan screen asks for the group first, and the first plan of each group asks for its own starting point.
- A group that changes hands leaves the former instructor's cycle open until they return or the admin settles it. A later story decides how to close a cycle that will never complete.
- The undo of a Held session (SCRUM-41) takes the session out of the cycle that counted it through `cycle_sessions`, which already records the cycle and the session, so it works per pair without change.
