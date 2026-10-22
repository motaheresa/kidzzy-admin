# ADR-0014: Deployment on the aaPanel VPS

- Status: Accepted
- Date: 2026-10-22
- Supersedes: [ADR-0009](0009-deployment-webuzo.md)
- Jira: SCRUM-63

## Context

Production moved off the Webuzo server onto a personal InterServer VPS managed with aaPanel. The machine has 1.6 GB of RAM, so compiling the NestJS API and the Vite app there is not reliable. ADR-0009 assumed Webuzo, a shared Node install and a build that could happen on the host. Local development stays without Docker (ADR-0010).

## Decision

Production is https://app.kidzzy-coders.com on this one VPS.

- Nginx, configured in aaPanel, serves `apps/web/dist`, proxies `/api` to `127.0.0.1:3000`, falls back to `index.html` for other paths, and sends `/sw.js` with `Cache-Control: no-cache`. The site certificate is Let's Encrypt, issued in aaPanel.
- PostgreSQL 18 runs on the same machine. Local development and CI stay on PostgreSQL 16 (ADR-0010).
- The API runs as one PM2 process named `kidzzy-api`, owned by the `deploy` user, with its working directory `apps/api` so it reads `apps/api/.env` (mode 600, never in git). The repository is `/www/wwwroot/kidzzy-admin`.
- A push to `main` deploys only after the `quality` job is green. GitHub Actions builds once. The deploy job sends that build with rsync and SSH (`StrictHostKeyChecking`), then `scripts/deploy.sh` checks out that commit, runs `pnpm install --frozen-lockfile`, `prisma migrate deploy`, `pm2 restart kidzzy-api` and `GET /api/v1/health`. The server does not run `pnpm build`. A failed step or a failed health check fails the job.
- Deploys of `main` are not cancelled when a newer commit is pushed, and they do not run in parallel: the workflow waits. Pull request runs still cancel their own older run.
- How to operate it is `docs/deployment.md`.

## Alternatives considered

- Building on the VPS: the RAM is not enough, and the binary that was tested in CI would not be the one that runs.
- Deploying `node_modules` from the GitHub runner: native modules (`argon2`, Prisma's engine) belong to the server's own install.
- Cancelling an in-progress deploy when `main` moves: a half-applied migration and a half-copied `dist` are worse than waiting for the running deploy to finish.

## Consequences

- The four secrets `SSH_HOST`, `SSH_USER`, `SSH_PRIVATE_KEY` and `SSH_KNOWN_HOSTS` live in GitHub, not in the repository. Until they exist, the deploy job fails.
- `prisma migrate deploy` only moves forward. Rolling the code back past a migration needs a database restore, not only an older commit.
- The daily `pg_dump` to Google Drive from ADR-0009 is not on this VPS yet. This decision does not recreate it.
- Nginx itself is not in the repository. The required locations are in the runbook and have to be checked on the server.
