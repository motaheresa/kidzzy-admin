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
#
# `deploy.sh preflight <sha>` checks the tools and the working tree and changes nothing. The
# workflow streams THIS commit's copy of the script into it (`git show <sha>:scripts/deploy.sh |
# bash -s -- preflight <sha>`) before any checkout, so a missing tool stops the deploy while the
# server is still exactly as it was. The full run repeats the same checks first.
set -euo pipefail

# A future pnpm bump through corepack must never wait for a download prompt.
export COREPACK_ENABLE_DOWNLOAD_PROMPT=0

# DEPLOY_ROOT, NVM_NODE_ROOT and AAPANEL_NODE_HOME exist for the tests; production uses the defaults.
ROOT="${DEPLOY_ROOT:-/www/wwwroot/kidzzy-admin}"
PUBLIC_HEALTH_URL=https://app.kidzzy-coders.com/api/v1/health
AAPANEL_NODE_HOME="${AAPANEL_NODE_HOME:-/www/server/nodejs}"
DRY_RUN=0
RELEASE=""
NODE_BIN=""
NODE_BIN_SOURCE=""

log() {
  printf '%s %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$*"
}

# The Node major in a .nvmrc line ("22", "v22.14.0", "22.14"). Prints nothing for anything else.
parse_node_major() {
  local value="${1:-}"
  value="${value//[$'\r ']/}"
  value="${value#v}"
  value="${value%%.*}"
  if [[ "$value" =~ ^[0-9]+$ ]]; then
    printf '%s\n' "$value"
  fi
}

# The Node major the repository asks for: the first line of a .nvmrc file. Prints nothing when
# the file is missing or has no number.
node_major() {
  parse_node_major "$(head -n 1 "$1" 2>/dev/null || true)"
}

# The newest <root>/v<major>.*/bin that really holds an executable node, or nothing. A newer
# major installed next to it is never picked: the repository decides the version. A root that
# does not exist, or that this user cannot enter (aaPanel's /www/server/nodejs is root-only), gives
# nothing: the glob stays unexpanded and the -x test fails, so it is skipped, not fatal.
newest_node_bin() {
  local root="$1" major="$2" dir
  local -a found=()
  for dir in "${root}"/v"${major}".*/bin; do
    if [[ -x "${dir}/node" ]]; then
      found+=("$dir")
    fi
  done
  if [[ "${#found[@]}" -gt 0 ]]; then
    printf '%s\n' "${found[@]}" | sort -V | tail -n 1
  fi
}

# Where Node comes from. A non-interactive SSH shell reads no ~/.bashrc, so nvm is not loaded and
# PATH has no Node. In this order:
#   1. DEPLOY_NODE_BIN, when set. An explicit choice: without an executable node in it, stop.
#   2. the newest nvm install of the major: $HOME/.nvm/versions/node/v<major>.*/bin (the deploy
#      user's own Node, the one the pm2 systemd unit runs the API with)
#   3. the newest aaPanel install: /www/server/nodejs/v<major>.*/bin, when this user can read it
# Sets NODE_BIN and NODE_BIN_SOURCE, both empty when none is found (then `node` on PATH decides).
choose_node_bin() {
  local major="$1" candidate
  NODE_BIN=""
  NODE_BIN_SOURCE=""
  if [[ -n "${DEPLOY_NODE_BIN:-}" ]]; then
    if [[ ! -x "${DEPLOY_NODE_BIN}/node" ]]; then
      log "DEPLOY_NODE_BIN=${DEPLOY_NODE_BIN} has no executable node"
      exit 1
    fi
    NODE_BIN="$DEPLOY_NODE_BIN"
    NODE_BIN_SOURCE="DEPLOY_NODE_BIN"
    return 0
  fi
  candidate="$(newest_node_bin "${NVM_NODE_ROOT:-${HOME}/.nvm/versions/node}" "$major")"
  if [[ -n "$candidate" ]]; then
    NODE_BIN="$candidate"
    NODE_BIN_SOURCE="nvm"
    return 0
  fi
  candidate="$(newest_node_bin "$AAPANEL_NODE_HOME" "$major")"
  if [[ -n "$candidate" ]]; then
    NODE_BIN="$candidate"
    NODE_BIN_SOURCE="aaPanel"
  fi
}

# Puts the chosen Node first on PATH and says which one it is.
select_node() {
  local major="$1"
  choose_node_bin "$major"
  if [[ -n "$NODE_BIN" ]]; then
    PATH="${NODE_BIN}:${PATH}"
    export PATH
    log "Node ${major} from ${NODE_BIN_SOURCE}: ${NODE_BIN}"
  else
    log "no Node ${major} in DEPLOY_NODE_BIN, nvm or aaPanel; using node from PATH"
  fi
}

# Whatever `node` resolves to must be the major .nvmrc asks for. </dev/null: with `bash -s` the
# script itself arrives on stdin, and no command may read it.
assert_node_major() {
  local major="$1" actual
  actual="$(node -p 'process.versions.node.split(".")[0]' </dev/null)"
  if [[ "$actual" != "$major" ]]; then
    log "node is v${actual} but .nvmrc asks for ${major}"
    exit 1
  fi
}

# Every tool the deploy needs, node (the major .nvmrc asks for) first. Runs no git command and
# changes nothing, so a missing tool stops the deploy before the server is touched.
preflight_tools() {
  local major="$1" version
  select_node "$major"
  require_commands
  assert_node_major "$major"
  # corepack resolves pnpm from the root package.json: prove it runs here, not later.
  version="$(cd "$ROOT" && pnpm --version </dev/null)"
  log "tools ok: node $(node --version </dev/null), pnpm ${version}"
}

# The commit is known here and no tracked file was edited by hand. Read-only.
preflight_repo() {
  local sha="$1"
  if ! git -C "$ROOT" cat-file -e "${sha}^{commit}" </dev/null 2>/dev/null; then
    log "commit ${sha} is not in ${ROOT}; git fetch origin main did not bring it"
    exit 1
  fi
  assert_clean_tree "$ROOT"
}

# Refuses to deploy over a hand edit: any change to a tracked file, staged or not. Untracked
# files (aaPanel's .user.ini, logs) are ignored on purpose, and so are ignored ones (.env, dist).
assert_clean_tree() {
  local repo="$1"
  git -C "$repo" update-index -q --refresh </dev/null || true
  if ! git -C "$repo" diff-index --quiet HEAD -- </dev/null; then
    log "tracked files were changed on the server; refusing to deploy:"
    git -C "$repo" status --short --untracked-files=no </dev/null >&2
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
  local script_root mode=deploy major nvmrc
  if [[ "${1:-}" == "--dry-run" ]]; then
    DRY_RUN=1
    shift
  fi
  if [[ "${1:-}" == "preflight" ]]; then
    mode=preflight
    shift
  fi
  local sha="${1:-}"
  RELEASE="/tmp/kidzzy-release/${sha}"

  if [[ "$DRY_RUN" -eq 0 ]] && [[ "$(id -u)" -eq 0 ]]; then
    log "deploy.sh must run as the deploy user, not root"
    exit 1
  fi

  if [[ ! "$sha" =~ ^[0-9a-f]{40}$ ]]; then
    log "usage: deploy.sh [--dry-run] [preflight] <40-character commit sha>"
    exit 1
  fi

  # The full run lives in the checkout it deploys. preflight runs from stdin, before any checkout,
  # so it has no script path to check.
  if [[ "$mode" == "deploy" ]]; then
    script_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
    if [[ "$DRY_RUN" -eq 1 ]]; then
      ROOT="$script_root"
    elif [[ "$script_root" != "$ROOT" ]]; then
      log "deploy.sh must live in ${ROOT}/scripts (found ${script_root})"
      exit 1
    fi
  fi

  # The Node major of the commit being deployed. preflight gets that commit's .nvmrc in
  # NVMRC_VALUE (the workflow reads it with `git show`, so this script runs no git command yet);
  # the full run reads the file the workflow has checked out.
  nvmrc="${NVMRC_VALUE:-}"
  if [[ -z "$nvmrc" ]]; then
    nvmrc="$(head -n 1 "${ROOT}/.nvmrc" 2>/dev/null || true)"
  fi
  major="$(parse_node_major "$nvmrc")"
  if [[ -z "$major" ]]; then
    log "cannot read the Node major from .nvmrc (got '${nvmrc}')"
    exit 1
  fi

  # Nothing on the server changes until every check below has passed.
  if [[ "$DRY_RUN" -eq 1 ]]; then
    select_node "$major"
    log "dry-run: require commands: git node pnpm pm2 curl rsync (node ${major})"
    log "dry-run: refuse when the commit is missing or tracked files were changed on the server"
  else
    preflight_tools "$major"
    preflight_repo "$sha"
  fi
  if [[ "$mode" == "preflight" ]]; then
    log "preflight ok for ${sha}"
    return 0
  fi

  cd "$ROOT"
  if [[ "$DRY_RUN" -eq 1 ]]; then
    log "dry-run: git fetch origin main && git checkout --detach ${sha}"
    log "dry-run: pnpm install --frozen-lockfile --ignore-scripts"
    log "dry-run: pnpm rebuild @prisma/engines prisma @node-rs/argon2"
    log "dry-run: prisma migrate deploy"
  else
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

if [[ "${BASH_SOURCE[0]:-$0}" == "$0" ]]; then
  main "$@"
fi
