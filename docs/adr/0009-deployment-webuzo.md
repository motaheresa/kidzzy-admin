# ADR-0009: Deployment on the existing InterServer server with Webuzo

- Status: Accepted, amended by [ADR-0010](0010-local-development-without-docker.md)
- Date: 2026-10-14

## Context

A long-running process is needed. An InterServer server managed with Webuzo is available through a regular (non-root) account; a personal server will follow later and host more sites.

## Decision

Production runs at app.kidzzy-coders.com. The root user installs PostgreSQL once through the Webuzo admin panel; the database and user are created from the Webuzo user panel. The API runs under PM2 as a single instance; Webuzo's web server serves the SPA, proxies /api and issues the Let's Encrypt certificate. Docker is used only for local development. A daily Webuzo cron job runs pg_dump, encrypts the dump and uploads it to Google Drive with rclone, keeping 30 days.

## Alternatives considered

- Vercel Hobby: non-commercial use only, daily cron limit.
- Docker in production: needs root on a shared server.
- Hetzner: higher price after its 2026 increase.

## Consequences

- The host's Node version is shared with other apps.
- Moving to the personal server later is a pg_dump and restore plus a redeploy, with no code change.
