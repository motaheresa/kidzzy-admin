#!/usr/bin/env bash
# Order of deploy.sh --dry-run, and which aaPanel Node bin is chosen.
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
sha="0123456789abcdef0123456789abcdef01234567"
out="$(bash "${root}/scripts/deploy.sh" --dry-run "$sha")"

order=(
  "pnpm install --frozen-lockfile --ignore-scripts"
  "pnpm rebuild @prisma/engines prisma @node-rs/argon2"
  "prisma migrate deploy"
  "rsync --delay-updates --delete-after apps/api/dist"
  "rsync --delay-updates --delete-after apps/web/dist"
  "rsync --delay-updates --delete-after packages/shared/dist"
  "pm2 restart kidzzy-api"
  "assert pm2 status online"
  "health https://app.kidzzy-coders.com/api/v1/health"
)

prev=0
step=""
line=""
for step in "${order[@]}"; do
  line="$(printf '%s\n' "$out" | grep -n -F "$step" | head -n 1 | cut -d: -f1)"
  if [[ -z "$line" || "$line" -le "$prev" ]]; then
    printf '%s\n' "step out of order or missing: ${step}" >&2
    printf '%s\n' "$out" >&2
    exit 1
  fi
  prev="$line"
done

tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT
mkdir -p "${tmp}/v20.0.0/bin" "${tmp}/v22.14.0/bin"
# shellcheck source=SCRIPTDIR/deploy.sh
source "${root}/scripts/deploy.sh"
bin="$(aapanel_node_bin "$tmp")"
if [[ "$bin" != "${tmp}/v22.14.0/bin" ]]; then
  printf '%s\n' "expected the newest Node bin, got '${bin}'" >&2
  exit 1
fi

printf '%s\n' "deploy.sh dry-run order and Node path ok"
