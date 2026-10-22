# Deployment

Production is the aaPanel VPS in [ADR-0014](adr/0014-deployment-aapanel.md). A push to `main` builds in GitHub Actions and, only after `quality` passes, copies that build to the server. The server does not compile the app.

## What a deploy does

1. The `quality` job installs, tests and runs `pnpm build`. It uploads `apps/api/dist`, `apps/web/dist` and `packages/shared/dist`. Those directories are the build the tests ran against.
2. The `deploy` job runs only on a push to `main`, after `quality`, on a new runner. It connects as the `deploy` user over SSH with strict host-key checking.
3. Before anything on the server changes, the job runs the preflight: `git fetch origin main`, then `git show <sha>:scripts/deploy.sh | bash -s -- preflight <sha>`. That streams this commit's own script into bash, so it runs before any checkout. It checks, in this order, that Node is the major in `.nvmrc`, that `pnpm` runs (`pnpm --version` from the repository root, so corepack resolves the pinned version), and that `pm2`, `git`, `curl` and `rsync` (the runner's rsync starts one on the server) are there; then that the commit is known and that no tracked file was changed by hand (staged or not; untracked files such as aaPanel's `.user.ini`, and ignored ones such as `.env` and `dist`, do not count). No git command runs until every tool is found, and nothing changes: the fetch only updates refs. A failure here leaves the server exactly as it was. Only then does it rsync the three `dist` directories to `/tmp/kidzzy-release/<sha>/`.
4. [`scripts/deploy.sh`](../scripts/deploy.sh) is then run from a checkout of that commit in `/www/wwwroot/kidzzy-admin`. It repeats the same checks first, then continues. A non-interactive SSH session does not read `~/.bashrc`, so nvm is not loaded and `PATH` has no Node; the script finds it itself (see "Where Node comes from").
5. Install is `pnpm install --frozen-lockfile --ignore-scripts`. That skips the root `prepare` script, so the server does not run `tsc` or `prisma generate`. It then runs `pnpm rebuild @prisma/engines prisma @node-rs/argon2`: the query engine, and argon2 because the API loads that native module at startup.
6. `prisma migrate deploy` runs next, while PM2 is still serving the previous `dist`. If the migration fails, the files on disk are still the ones the process is running.
7. The three `dist` directories are published with `rsync -a --delete --delay-updates --delete-after`. The live directory is not deleted first, so Nginx never sees a missing `index.html`.
8. `pm2 restart kidzzy-api`. The job fails unless PM2 reports the process `online` and `https://app.kidzzy-coders.com/api/v1/health` returns `{"status":"ok"}` within 30 seconds. The public URL is what proves Nginx, TLS and the proxy, not only that the process listens on port 3000. The VPS must be able to reach its own site name.

The deploy job uses the GitHub environment `production` and the concurrency group `deploy-production` (`cancel-in-progress: false`). A newer push waits. It does not cancel a deploy that is already running, and two deploys do not run at once. A new commit on a pull request still cancels that pull request's older quality run. The workflow-level group does the same for the rest of the `main` run.

## Where Node comes from

`deploy.sh` puts one Node `bin` first on `PATH` and logs which one (`Node 22 from nvm: /home/deploy/.nvm/versions/node/v22.23.3/bin`). `<major>` is the number in `.nvmrc` (22), so a newer Node installed next to it is never picked. In this order:

1. `DEPLOY_NODE_BIN`, when set in the environment of the SSH session: an explicit choice. A directory without an executable `node` stops the deploy.
2. The newest `$HOME/.nvm/versions/node/v<major>.*/bin`. This is the `deploy` user's own Node, the one the `pm2-deploy` systemd unit starts PM2 with, so the API and the deploy run on the same Node. `pnpm` is installed in that same `bin` through corepack.
3. The newest `/www/server/nodejs/v<major>.*/bin` (aaPanel). On this server that directory is `root`-only (`drw-------`), so the `deploy` user cannot enter it: a directory the user cannot read is skipped quietly, never fatal.

If none is found, `node` on the default `PATH` decides. Whatever `node` resolves to must be the `.nvmrc` major, or the preflight stops. The script sets `COREPACK_ENABLE_DOWNLOAD_PROMPT=0`, so a future pnpm bump through corepack never waits for a prompt that nobody can answer.

## One-time server setup

The `deploy` user already owns the clone and the PM2 process. These are the pieces the script assumes, not steps it performs:

- Node 22 is installed with nvm for the `deploy` user (`~/.nvm/versions/node/v22.*`), with `pnpm` (corepack) and `pm2` in the same `bin`. `curl`, `git` and `rsync` are on the default `PATH` (`/usr/bin`). The runner's rsync starts an rsync on the server too, which the preflight checks before anything is copied.
- The clone is `/www/wwwroot/kidzzy-admin`, with `origin` pointing at this repository, and the `deploy` user can `git fetch`.
- `apps/api/.env` exists, mode `600`, and is never committed. `NODE_ENV=production`, `DATABASE_URL` and `JWT_ACCESS_SECRET` are set there. `COOKIE_SECURE` stays true.
- PM2 was started once from the API directory, so restarts keep reading that `.env`:

  ```bash
  cd /www/wwwroot/kidzzy-admin/apps/api
  pm2 start dist/main.js --name kidzzy-api
  pm2 save
  ```

  The first `main` push after that uses `pm2 restart`. If the process does not exist, the deploy fails on purpose.

Create a GitHub environment named `production` and add yourself as a required reviewer. That is the approval gate: the deploy job waits until you approve it. The four secrets can stay repository secrets: a job that names an environment also reads the repository's secrets, and an environment secret with the same name would win over the repository one. For a stronger gate, move `SSH_PRIVATE_KEY` to the environment: repository secrets are readable by any workflow in the repository, while an environment secret is only handed to the job after the required reviewer approves. If you keep "Prevent self-review" off, you can approve the deploys your own merge starts; with it on and you as the only reviewer, the deploy would wait forever.

`SSH_USER` is a repository **variable** (Settings, Secrets and variables, Actions, Variables), not a secret: its value `deploy` is not secret, and as a secret GitHub masks every `deploy` in the logs as `***`. The workflow reads `vars.SSH_USER` first and falls back to a secret of the same name, so an old secret keeps working until it is deleted. The other three are repository secrets (`gh secret set`).

| Name              | Value                                                                             |
| ----------------- | --------------------------------------------------------------------------------- |
| `SSH_HOST`        | The server host or IP                                                             |
| `SSH_USER`        | `deploy` (repository variable)                                                    |
| `SSH_PRIVATE_KEY` | The private key, including the `BEGIN` and `END` lines                            |
| `SSH_KNOWN_HOSTS` | One line from `ssh-keyscan -H <host>` on a machine that already trusts the server |

## Nginx

Configured in aaPanel, not in this repository. The site root is `apps/web/dist`. `/api` is proxied to `127.0.0.1:3000`. Every other path falls back to `index.html`, so a refresh on `/students/…` still opens the app. `/sw.js` is served with `Cache-Control: no-cache`, so a new worker is picked up immediately.

```nginx
root /www/wwwroot/kidzzy-admin/apps/web/dist;
index index.html;

location /api/ {
    proxy_pass http://127.0.0.1:3000;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
}

location = /sw.js {
    add_header Cache-Control "no-cache";
    try_files /sw.js =404;
}

location / {
    try_files $uri $uri/ /index.html;
}
```

Check on the server after a deploy:

- `https://app.kidzzy-coders.com/students` returns the app HTML, not Nginx's 404.
- `curl -sI https://app.kidzzy-coders.com/sw.js` includes `cache-control: no-cache`.

## Logs

`pm2 logs kidzzy-api` follows the process. The files are `~/.pm2/logs/kidzzy-api-out.log` and `kidzzy-api-error.log`. `deploy.sh` writes its own lines to the Actions log with a UTC timestamp (`2026-10-22T08:00:00Z …`). Nginx's own error log is in the aaPanel site screen.

## Rolling back

`prisma migrate deploy` only applies new migrations. It does not undo one.

To put the previous build back, re-run the successful workflow of that commit in GitHub Actions (Actions, the run, Re-run all jobs). `quality` builds that commit again and `deploy.sh` checks it out. Do this only when that commit's migrations are already the database's current ones.

The uploaded `dist` artifact is kept for 5 days (`retention-days: 5`). Re-running all jobs does not need that artifact, because `quality` builds again. Re-running only the deploy job fails once the artifact has expired.

Checking out an older commit by hand, without its `dist` from CI, does not roll the running app back: PM2 serves `apps/api/dist`, which is the last CI build copied into place.

If a migration itself was wrong, restore the database from a backup and then deploy a commit that matches that backup. The daily encrypted `pg_dump` from the old Webuzo server is not running on this VPS yet.
