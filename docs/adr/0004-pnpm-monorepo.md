# ADR-0004: pnpm monorepo

- Status: Accepted
- Date: 2026-10-14

## Context

The API and the web app share enums and types and often change together.

## Decision

One repository with apps/api, apps/web and packages/shared, managed with pnpm workspaces. packages/shared builds to CommonJS (for Nest) and ESM (for Vite).

## Alternatives considered

- Two repositories: types drift apart, two pull requests per feature.

## Consequences

- One CI pipeline builds and tests both apps.
- packages/shared must be built before the apps; `pnpm install` does it automatically.
