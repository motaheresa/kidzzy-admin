# ADR-0008: Notifications in the database plus Web Push

- Status: Accepted
- Date: 2026-10-14

## Context

Staff need in-app notifications and alerts on their phones.

## Decision

Every notification is a row in notifications (the in-app center); delivery to devices uses the web-push library with VAPID keys. Expired subscriptions (HTTP 404 or 410 from the push service) are deleted.

## Alternatives considered

- Firebase Cloud Messaging: an extra vendor and SDK for the same browser feature.

## Consequences

- Users who refuse notification permission get no push, but the in-app center still holds every notification.

## Note, 2026-11-27: announcements use the same path (SCRUM-51)

An announcement (US-31) is one row in `announcements` and one `notify()` per recipient, in one transaction. So each recipient sees it in the notification center at once, and its web push goes out on the next tick (ADR-0016), like every other notification. There is no second, immediate push path: a send inside the request would skip the job's claim, retry with back-off and expired-subscription cleanup, could push an announcement whose transaction then rolled back, and would make the sender wait for every push service. A tick sends at most 50 pushes per academy, so a larger announcement is delivered to devices over several ticks.
