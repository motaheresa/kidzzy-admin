# Deployment

Production is the aaPanel VPS in [ADR-0014](adr/0014-deployment-aapanel.md). A push to `main` builds in GitHub Actions and, only after `quality` passes, copies that build to the server. The server does not compile the app.

## What a deploy does

1. The `quality` job installs, tests and runs `pnpm build`. It uploads `apps/api/dist`, `apps/web/dist` and `packages/shared/dist`. Those directories are the build the tests ran against.
2. The `deploy` job runs only on a push to `main`, after `quality`, on a new runner. It connects as the `deploy` user over SSH with strict host-key checking.
3. It rsyncs the three `dist` directories to `/tmp/kidzzy-release/<sha>/` on the server.
4. [`scripts/deploy.sh`](../scripts/deploy.sh) checks out that commit in `/www/wwwroot/kidzzy-admin`, runs `pnpm install --frozen-lockfile` (dependencies and the Prisma client, not `pnpm build`), copies the CI `dist` over whatever install produced, runs `prisma migrate deploy`, restarts the PM2 process `kidzzy-api` and requests `GET /api/v1/health`. Any failure, including 30 seconds without `{"status":"ok"}`, fails the job.

A newer push to `main` waits. It does not cancel a deploy that is already running, and two deploys do not run at once. A new commit on a pull request still cancels that pull request's older run.

## One-time server setup

The `deploy` user already owns the clone and the PM2 process. These are the pieces the script assumes, not steps it performs:

- Node 22, pnpm 10 and `pm2` are on the `PATH` of a non-interactive SSH session. A version manager that only loads in an interactive shell will make the job fail with `missing command`.
- The clone is `/www/wwwroot/kidzzy-admin`, with `origin` pointing at this repository, and the `deploy` user can `git fetch`.
- `apps/api/.env` exists, mode `600`, and is never committed. `NODE_ENV=production`, `DATABASE_URL` and `JWT_ACCESS_SECRET` are set there. `COOKIE_SECURE` stays true.
- PM2 was started once from the API directory, so restarts keep reading that `.env`:

  ```bash
  cd /www/wwwroot/kidzzy-admin/apps/api
  pm2 start dist/main.js --name kidzzy-api
  pm2 save
  ```

  The first `main` push after that uses `pm2 restart`. If the process does not exist, the deploy fails on purpose.

GitHub repository secrets, set with `gh secret set` and never committed:

| Secret            | Value                                                                             |
| ----------------- | --------------------------------------------------------------------------------- |
| `SSH_HOST`        | The server host or IP                                                             |
| `SSH_USER`        | `deploy`                                                                          |
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

`pm2 logs kidzzy-api` follows the process. The files are `~/.pm2/logs/kidzzy-api-out.log` and `kidzzy-api-error.log`. Nginx's own error log is in the aaPanel site screen.

## Rolling back

`prisma migrate deploy` only applies new migrations. It does not undo one.

To put the previous build back, re-run the successful workflow of that commit in GitHub Actions (Actions, the run, Re-run all jobs). That commit is built again on GitHub and `deploy.sh` checks it out. Do this only when that commit's migrations are already the database's current ones.

Checking out an older commit by hand, without its `dist` from CI, does not roll the running app back: PM2 serves `apps/api/dist`, which is the last CI build copied into place.

If a migration itself was wrong, restore the database from a backup and then deploy a commit that matches that backup. The daily encrypted `pg_dump` from the old Webuzo server is not running on this VPS yet.
