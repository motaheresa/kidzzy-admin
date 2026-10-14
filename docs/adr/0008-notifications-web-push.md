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
