# ADR-0003: React + Vite single-page PWA

- Status: Accepted
- Date: 2026-10-14

## Context

Staff-only app behind login, used on phones by instructors, needs web push.

## Decision

A React + Vite SPA built to static files, installable as a PWA with a service worker. Arabic RTL UI with Tailwind CSS and shadcn/ui.

## Alternatives considered

- Next.js: server rendering brings no benefit behind login and adds a second server.

## Consequences

- All data comes from the API.
- iOS shows web push only after the user installs the PWA to the home screen.
