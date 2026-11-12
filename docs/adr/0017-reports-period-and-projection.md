# ADR-0017: The period of a report, and the finance projection

- Status: Accepted
- Date: 2026-11-12

## Context

The reports workspace (US-38) answers three money questions: what came in and went out in a period, what the period should bring, and what one full round of cycles is worth. The first is a sum. The second needs a rule for a future that has not happened, and a period has to mean the same thing for the person, the URL and the database.

## Decision

**The period.** `from` and `to` are academy-local dates, both included. A missing end is the edge of the current local month (neither given: the whole month). `to` before `from` is 400, and more than 366 days is 422 `REPORT_PERIOD_TOO_LONG`. Instants come from `occurrenceInstant` in the academy's zone, so a local midnight is right on the days Egypt changes its clock; the end is the next local midnight, excluded. `paid_on` is a date, so it is compared as a date, never as an instant.

**Actual** is the sum of the payments whose `paid_on` is in the period, split by payee type of the cycle: students pay in, instructors are paid out.

**Expected** is two parts. The part of the period that has passed is read from the cycles' `due_at`, at their plan amount, because a due cycle is a fact. The part still ahead is a projection: for each cycle in progress the sessions it still needs are walked on the payee's future Scheduled sessions in time order, and the cycle counts at its plan amount if the session that completes it falls in the period. The walk continues with the next cycle at the latest plan version (a plan change applies from the next cycle) while sessions fall in the period. Past the sessions the generator has made (`SESSION_GENERATION_WEEKS`), each active group is extended with its active slots as weekly occurrences, taught by the group's current instructor. A student with no open enrollment or no plan, and an (instructor, group) pair with no plan, are left out and counted.

The projection is a pure function (`finance-projection.ts`): the repository loads rows, the function decides. It assumes nobody joins or leaves and no further session is cancelled, and the report says so. A past session that is still Scheduled is ignored until it is held. A payee with a plan but no cycle in progress contributes nothing and is not counted as skipped, because a Due cycle takes no more sessions.

**Outstanding** is every Due and unpaid cycle, whatever the period. **Overview** is one cycle at the latest plan for every student with an open enrollment and a plan, and for every pair of an active group with its current instructor, plus the average round length in weeks.

**Money** is a decimal string end to end: Decimal in the database and in the sums, never a JS number.

## Alternatives considered

- Project the whole period, including its passed part, from sessions: the cycles that became due in the past would be guessed instead of read.
- Store the expected figures: they would be stale after any session change.
- A SQL window query for the walk: the rules are many small cases, and a pure function is tested without a database.

## Consequences

- The expected figure moves when sessions are cancelled or plans change, as it should.
- A period far ahead depends on the groups' slots, so it is a projection of the schedule, not of attendance.
- A new report page reuses the same period (`from`, `to` in the URL) and the `reports.read` permission.

## Note (2026-11-12): session statistics

The sessions report (US-39, `GET /reports/sessions`) reuses the same period (from, to, both included, 400 and 422) and the same permission.

- **A session belongs to the academy-local date of its `scheduled_at`**, never a UTC slice, so a 23:30 session in Cairo counts on its own day. The period's instants clip what the repository loads; the bucketing derives the local date again.
- **State:** held and cancelled as stored; Scheduled before now is unmarked, Scheduled at or after now is upcoming.
- **Buckets:** a period of 62 days or less is one bucket per local day (empty days included), a longer one is one bucket per local month (first and last may be partial).
- **Attendance rate** is present over all attendance rows of the period's held sessions; **average duration** is over held sessions with actual times.
- The bucketing and the KPIs are a pure function (`session-stats.ts`), like the projection.
