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

# The Node major the repository asks for: the first line of .nvmrc ("22" or "v22.14.0").
# Prints nothing when the file is missing or has no number.
node_major() {
  local value
  value="$(head -n 1 "$1" 2>/dev/null || true)"
  value="${value//[$'\r ']/}"
  value="${value#v}"
  value="${value%%.*}"
  if [[ "$value" =~ ^[0-9]+$ ]]; then
    printf '%s\n' "$value"
  fi
}

# The newest aaPanel Node bin of that major (v22.* for 22), or empty when none matches.
# A newer major installed next to it is never picked: the repository decides the version.
# Non-interactive SSH does not read .bashrc, so the caller prepends this to PATH.
aapanel_node_bin() {
  local home="$1" major="$2"
  if [[ ! -d "$home" ]]; then
    return 0
  fi
  find "$home" -mindepth 2 -maxdepth 2 -type d -name bin -path "${home}/v${major}.*/bin" |
    sort -V | tail -n 1
}

prepend_aapanel_node() {
  local major="$1" node_bin
  # No aaPanel Node tree at all (a dev machine, or Node installed another way): leave PATH alone.
  # require_commands and assert_node_major still check what `node` resolves to.
  if [[ ! -d "$AAPANEL_NODE_HOME" ]]; then
    return 0
  fi
  node_bin="$(aapanel_node_bin "$AAPANEL_NODE_HOME" "$major")"
  if [[ -z "$node_bin" ]]; then
    log "no Node ${major} under ${AAPANEL_NODE_HOME} (.nvmrc asks for ${major}); install it in aaPanel"
    exit 1
  fi
  PATH="${node_bin}:${PATH}"
  export PATH
  log "PATH prepended with ${node_bin}"
}

# Whatever `node` resolves to must be the major .nvmrc asks for.
assert_node_major() {
  local major="$1" actual
  actual="$(node -p 'process.versions.node.split(".")[0]')"
  if [[ "$actual" != "$major" ]]; then
    log "node is v${actual} but .nvmrc asks for ${major}"
    exit 1
  fi
}

# Refuses to deploy over a hand edit: any change to a tracked file, staged or not. Untracked
# files (aaPanel's .user.ini, logs) are ignored on purpose, and so are ignored ones (.env, dist).
assert_clean_tree() {
  local repo="$1"
  git -C "$repo" update-index -q --refresh || true
  if ! git -C "$repo" diff-index --quiet HEAD --; then
    log "tracked files were changed on the server; refusing to deploy:"
    git -C "$repo" status --short --untracked-files=no >&2
    exit 1
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

  # The workflow checked out this commit before starting this script, so .nvmrc is the one of
  # the commit being deployed.
  local major
  major="$(node_major "${ROOT}/.nvmrc")"
  if [[ -z "$major" ]]; then
    log "cannot read the Node major from ${ROOT}/.nvmrc"
    exit 1
  fi
  prepend_aapanel_node "$major"
  if [[ "$DRY_RUN" -eq 1 ]]; then
    log "dry-run: require commands: git node pnpm pm2 curl rsync (node ${major})"
  else
    require_commands
    assert_node_major "$major"
  fi

  cd "$ROOT"
  if [[ "$DRY_RUN" -eq 1 ]]; then
    log "dry-run: refuse when tracked files were changed on the server"
    log "dry-run: git fetch origin main && git checkout --detach ${sha}"
    log "dry-run: pnpm install --frozen-lockfile --ignore-scripts"
    log "dry-run: pnpm rebuild @prisma/engines prisma @node-rs/argon2"
    log "dry-run: prisma migrate deploy"
  else
    # A hand edit of a tracked file stops the deploy instead of being carried along or lost.
    assert_clean_tree "$ROOT"
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
