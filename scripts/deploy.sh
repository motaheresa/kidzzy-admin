#!/usr/bin/env bash
# Deploy one commit on the VPS (SCRUM-63, ADR-0014).
#
# GitHub Actions has already rsynced the build CI tested to
# /tmp/kidzzy-release/<sha>/. This script then:
#   1. checks out that commit
#   2. installs dependencies without lifecycle scripts (no tsc, no prisma generate)
#   3. rebuilds only the native pieces the running process needs
#   4. applies migrations while the previous dist is still what PM2 is serving
#   5. publishes the new dist in place (rsync, not rm)
#   6. restarts PM2, requires status online, then checks the public health URL
#
# The server does not run pnpm build. It has 1.6 GB of RAM.
set -euo pipefail

ROOT=/www/wwwroot/kidzzy-admin
PUBLIC_HEALTH_URL=https://app.kidzzy-coders.com/api/v1/health
AAPANEL_NODE_HOME="${AAPANEL_NODE_HOME:-/www/server/nodejs}"
DRY_RUN=0
RELEASE=""

log() {
  printf '%s %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$*"
}

# Newest aaPanel Node bin, or empty when that tree is absent.
# Non-interactive SSH does not read .bashrc, so the caller prepends this to PATH.
aapanel_node_bin() {
  local home="$1"
  if [[ ! -d "$home" ]]; then
    return 0
  fi
  find "$home" -mindepth 2 -maxdepth 2 -type d -name bin | sort -V | tail -n 1
}

prepend_aapanel_node() {
  local node_bin
  node_bin="$(aapanel_node_bin "$AAPANEL_NODE_HOME")"
  if [[ -n "$node_bin" ]]; then
    PATH="${node_bin}:${PATH}"
    export PATH
    log "PATH prepended with ${node_bin}"
  fi
}

require_commands() {
  local cmd
  for cmd in git node pnpm pm2 curl rsync; do
    if ! command -v "$cmd" >/dev/null 2>&1; then
      log "missing command: ${cmd}"
      exit 1
    fi
  done
}

publish_dist() {
  local relative="$1"
  local src="${RELEASE}/${relative}"
  local dest="${ROOT}/${relative}"
  if [[ "$DRY_RUN" -eq 1 ]]; then
    log "dry-run: rsync --delay-updates --delete-after ${relative}"
    return 0
  fi
  if [[ ! -d "$src" ]]; then
    log "release is missing ${relative}"
    exit 1
  fi
  mkdir -p "$dest"
  # --delay-updates renames each new file into place at the end, and
  # --delete-after removes stale files only after that. The directory is never removed.
  rsync -a --delete --delay-updates --delete-after "${src}/" "${dest}/"
}

assert_pm2_online() {
  local status
  if [[ "$DRY_RUN" -eq 1 ]]; then
    log "dry-run: assert pm2 status online"
    return 0
  fi
  status="$(
    pm2 jlist | node --input-type=module -e 'import fs from "node:fs"; const list = JSON.parse(fs.readFileSync(0, "utf8")); const proc = list.find((item) => item.name === "kidzzy-api"); process.stdout.write(proc?.pm2_env?.status ?? "");'
  )"
  if [[ "$status" != "online" ]]; then
    log "PM2 status for kidzzy-api is '${status}', expected online"
    pm2 logs kidzzy-api --lines 50 --nostream || true
    exit 1
  fi
  log "PM2 kidzzy-api is online"
}

wait_for_health() {
  local ready body
  if [[ "$DRY_RUN" -eq 1 ]]; then
    log "dry-run: health ${PUBLIC_HEALTH_URL}"
    return 0
  fi
  ready=0
  for _ in $(seq 1 30); do
    body="$(curl -fsS "$PUBLIC_HEALTH_URL" || true)"
    if [[ "$body" == *'"status":"ok"'* ]]; then
      ready=1
      break
    fi
    sleep 1
  done
  if [[ "$ready" -ne 1 ]]; then
    log "health check failed: ${PUBLIC_HEALTH_URL}"
    pm2 logs kidzzy-api --lines 50 --nostream || true
    exit 1
  fi
  log "health ok: ${PUBLIC_HEALTH_URL}"
}

main() {
  local script_root
  if [[ "${1:-}" == "--dry-run" ]]; then
    DRY_RUN=1
    shift
  fi
  local sha="${1:-}"
  RELEASE="/tmp/kidzzy-release/${sha}"

  if [[ "$DRY_RUN" -eq 0 ]] && [[ "$(id -u)" -eq 0 ]]; then
    log "deploy.sh must run as the deploy user, not root"
    exit 1
  fi

  script_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
  if [[ "$DRY_RUN" -eq 1 ]]; then
    ROOT="$script_root"
  elif [[ "$script_root" != "$ROOT" ]]; then
    log "deploy.sh must live in ${ROOT}/scripts (found ${script_root})"
    exit 1
  fi

  if [[ ! "$sha" =~ ^[0-9a-f]{40}$ ]]; then
    log "usage: deploy.sh [--dry-run] <40-character commit sha>"
    exit 1
  fi

  prepend_aapanel_node
  if [[ "$DRY_RUN" -eq 1 ]]; then
    log "dry-run: require commands: git node pnpm pm2 curl rsync"
  else
    require_commands
  fi

  cd "$ROOT"
  if [[ "$DRY_RUN" -eq 1 ]]; then
    log "dry-run: git fetch origin main && git checkout --detach ${sha}"
    log "dry-run: pnpm install --frozen-lockfile --ignore-scripts"
    log "dry-run: pnpm rebuild @prisma/engines prisma @node-rs/argon2"
    log "dry-run: prisma migrate deploy"
  else
    # A dirty tracked file stops the deploy instead of being thrown away.
    git fetch origin main
    git checkout --detach "$sha"
    if [[ "$(git rev-parse HEAD)" != "$sha" ]]; then
      log "checkout did not land on ${sha}"
      exit 1
    fi
    # --ignore-scripts skips prepare (shared's tsc and prisma generate).
    # The dist copied below is the one CI tested. Rebuild only the native
    # binaries: Prisma's query engine, and argon2 because the API loads it
    # at startup. HUSKY=0 is belt and braces if a script still runs.
    export HUSKY=0
    pnpm install --frozen-lockfile --ignore-scripts
    pnpm rebuild @prisma/engines prisma @node-rs/argon2
    # Migrate before replacing dist. A failed migration leaves the files PM2
    # is already running. A later crash-restart cannot boot new code on the old schema.
    pnpm --filter @kidzzy/api prisma:deploy
  fi

  publish_dist "apps/api/dist"
  publish_dist "apps/web/dist"
  publish_dist "packages/shared/dist"

  if [[ "$DRY_RUN" -eq 1 ]]; then
    log "dry-run: pm2 restart kidzzy-api"
  else
    if [[ ! -f "${ROOT}/apps/api/dist/main.js" ]]; then
      log "API build has no dist/main.js"
      exit 1
    fi
    if [[ ! -f "${ROOT}/apps/web/dist/index.html" || ! -f "${ROOT}/apps/web/dist/sw.js" ]]; then
      log "web build is missing index.html or sw.js"
      exit 1
    fi
    # cwd stays apps/api from the one-time pm2 start, so apps/api/.env is read.
    pm2 restart kidzzy-api --update-env
  fi

  assert_pm2_online
  wait_for_health

  if [[ "$DRY_RUN" -eq 0 ]]; then
    rm -rf "$RELEASE"
    log "deployed ${sha}"
  fi
}

if [[ "${BASH_SOURCE[0]}" == "$0" ]]; then
  main "$@"
fi
