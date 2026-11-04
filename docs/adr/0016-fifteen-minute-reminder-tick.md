# ADR-0016: A 15-minute tick, and reminders computed when it runs

- Status: Accepted
- Date: 2026-11-04
- Amends: ADR-0007

## Context

ADR-0007 checks reminders every minute. The academy has about 25 groups, and a minute tick is more runs than that volume needs. Session reminders (US-26) also have to follow a reschedule, a cancellation and an instructor change.

## Decision

The push tick and the session-reminder job each use `@Cron('0,15,30,45 * * * *')`. Quarter hours are the same in Cairo and UTC, so the cron has no timezone. A few seconds after startup each job runs once, without awaiting, so overdue work does not wait for the next quarter hour. Tests turn that run off, because every e2e file boots the API against one database.

A failed push waits 15, 30, 60, then 120 minutes before the next try. Five attempts is unchanged.

Session reminders are not stored as future jobs. Each run reads Scheduled sessions and sends a lead (1 day, then 1 hour) whose moment has passed and whose start is still ahead, inside a short grace window. The instructor on the session at that read is the only recipient. The claim is a row in `session_reminders`, inserted before `notify` with `ON CONFLICT DO NOTHING`, in the same transaction. The unique key is `(session_id, lead_minutes)`, not the clock time.

## Alternatives considered

- Keep the one-minute interval: more runs than 25 groups need.
- Store a job per session when it is generated, and rewrite it on every reschedule, cancel and instructor change: a missed rewrite sends the old time.

## Consequences

- A push, for example "payment recorded", can arrive up to 15 minutes after the event.
- The 1-hour reminder can arrive 45 to 60 minutes before the session, so its text names the clock time.
- A session that already received its 1-day reminder, then was rescheduled, does not receive that reminder again. That is intended.
- A session that already received its 1-hour reminder, then was moved further away, does not receive that reminder again before the new time. That is rare and intended: the key is the session and the lead, not the time.
- The 1-hour lead still fires at a new time when it has not been sent yet.
