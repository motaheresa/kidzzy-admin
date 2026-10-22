#!/usr/bin/env bash
# Deploy one commit on the VPS (SCRUM-63, ADR-0014).
#
# The GitHub Actions deploy job has already uploaded the build that CI tested to
# /tmp/kidzzy-release/<sha>/. This script checks out that commit, installs
# dependencies, puts those built files in place, applies migrations, restarts
# PM2 and refuses to succeed unless GET /api/v1/health answers ok.
#
# It does not build the API or the web app. The server has 1.6 GB of RAM, and
# the artifacts from CI are the ones that were tested.
set -euo pipefail

ROOT=/www/wwwroot/kidzzy-admin
SHA="${1:-}"
RELEASE="/tmp/kidzzy-release/${SHA}"

if [[ "$(id -u)" -eq 0 ]]; then
  echo "deploy.sh must run as the deploy user, not root" >&2
  exit 1
fi

script_root="$(cd "$(dirname "$0")/.." && pwd)"
if [[ "$script_root" != "$ROOT" ]]; then
  echo "deploy.sh must live in ${ROOT}/scripts (found ${script_root})" >&2
  exit 1
fi

if [[ ! "$SHA" =~ ^[0-9a-f]{40}$ ]]; then
  echo "usage: deploy.sh <40-character commit sha>" >&2
  exit 1
fi

for cmd in git node pnpm pm2 curl; do
  if ! command -v "$cmd" >/dev/null 2>&1; then
    echo "missing command: $cmd (a non-interactive SSH session must find it on PATH)" >&2
    exit 1
  fi
done

cd "$ROOT"

# The commit pushed to main. A dirty tracked file stops the deploy instead of
# being thrown away.
git fetch origin main
git checkout --detach "$SHA"
if [[ "$(git rev-parse HEAD)" != "$SHA" ]]; then
  echo "checkout did not land on ${SHA}" >&2
  exit 1
fi

# prepare builds @kidzzy/shared and generates the Prisma client. HUSKY=0 so the
# git hook installer does not fail in this session. The tested dist is copied
# afterwards, so this rebuild of shared is not what gets served.
export HUSKY=0
pnpm install --frozen-lockfile

install_dist() {
  local relative="$1"
  local src="${RELEASE}/${relative}"
  local dest="${ROOT}/${relative}"
  if [[ ! -d "$src" ]]; then
    echo "release is missing ${relative} (CI uploads it before this script runs)" >&2
    exit 1
  fi
  rm -rf "$dest"
  mkdir -p "$dest"
  cp -a "${src}/." "$dest/"
}

install_dist "apps/api/dist"
install_dist "apps/web/dist"
install_dist "packages/shared/dist"

if [[ ! -f "${ROOT}/apps/api/dist/main.js" ]]; then
  echo "API build has no dist/main.js" >&2
  exit 1
fi
if [[ ! -f "${ROOT}/apps/web/dist/index.html" || ! -f "${ROOT}/apps/web/dist/sw.js" ]]; then
  echo "web build is missing index.html or sw.js" >&2
  exit 1
fi

pnpm --filter @kidzzy/api prisma:deploy

# The process was created once with cwd apps/api, so it reads apps/api/.env.
# restart keeps that cwd. A missing process fails the deploy.
pm2 restart kidzzy-api --update-env

port=3000
env_file="${ROOT}/apps/api/.env"
if [[ -f "$env_file" ]]; then
  raw="$(grep -E '^PORT=' "$env_file" | tail -n 1 || true)"
  raw="${raw#PORT=}"
  raw="${raw%\"}"
  raw="${raw#\"}"
  raw="${raw//$'\r'/}"
  if [[ "$raw" =~ ^[0-9]+$ ]]; then
    port="$raw"
  fi
fi

health_url="http://127.0.0.1:${port}/api/v1/health"
ready=0
for _ in $(seq 1 30); do
  body="$(curl -fsS "$health_url" || true)"
  if [[ "$body" == *'"status":"ok"'* ]]; then
    ready=1
    break
  fi
  sleep 1
done

if [[ "$ready" -ne 1 ]]; then
  echo "health check failed: ${health_url}" >&2
  pm2 logs kidzzy-api --lines 50 --nostream || true
  exit 1
fi

rm -rf "$RELEASE"
echo "deployed ${SHA}"
