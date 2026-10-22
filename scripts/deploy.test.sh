#!/usr/bin/env bash
# Order of deploy.sh --dry-run, which aaPanel Node bin is chosen, and the clean-tree check.
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
# shellcheck source=SCRIPTDIR/deploy.sh
source "${root}/scripts/deploy.sh"

fail() {
  printf '%s
' "$1" >&2
  exit 1
}

# The Node major comes from .nvmrc, however it is written.
for pair in "22:22" "v22.14.0:22" "22.14:22" "lts/*:" ""; do
  printf '%s
' "${pair%%:*}" >"${tmp}/nvmrc"
  [[ -z "${pair%%:*}" ]] && : >"${tmp}/nvmrc"
  got="$(node_major "${tmp}/nvmrc")"
  [[ "$got" == "${pair#*:}" ]] || fail "node_major '${pair%%:*}': expected '${pair#*:}', got '${got}'"
done
[[ -z "$(node_major "${tmp}/missing")" ]] || fail "node_major of a missing file should be empty"

# The Node bin is the newest of the asked major, never a newer major installed next to it.
mkdir -p "${tmp}/nodejs/v20.0.0/bin" "${tmp}/nodejs/v22.3.0/bin" "${tmp}/nodejs/v22.14.0/bin"   "${tmp}/nodejs/v24.1.0/bin"
bin="$(aapanel_node_bin "${tmp}/nodejs" 22)"
[[ "$bin" == "${tmp}/nodejs/v22.14.0/bin" ]] || fail "expected the newest v22 bin, got '${bin}'"
bin="$(aapanel_node_bin "${tmp}/nodejs" 24)"
[[ "$bin" == "${tmp}/nodejs/v24.1.0/bin" ]] || fail "expected the v24 bin, got '${bin}'"
[[ -z "$(aapanel_node_bin "${tmp}/nodejs" 18)" ]] || fail "no Node 18 is installed: expected empty"
[[ -z "$(aapanel_node_bin "${tmp}/absent" 22)" ]] || fail "an absent tree should give empty"

# Hand edits of tracked files stop the deploy; untracked and ignored files do not.
repo="${tmp}/repo"
git init -q "$repo"
git -C "$repo" config user.email test@example.com
git -C "$repo" config user.name test
printf 'one
' >"${repo}/tracked.txt"
printf 'ignored.txt
' >"${repo}/.gitignore"
git -C "$repo" add .
git -C "$repo" commit -q -m init
(assert_clean_tree "$repo") >/dev/null || fail "a clean tree should pass"
printf 'x
' >"${repo}/untracked.txt"
printf 'x
' >"${repo}/ignored.txt"
(assert_clean_tree "$repo") >/dev/null || fail "untracked and ignored files should pass"
printf 'two
' >"${repo}/tracked.txt"
if (assert_clean_tree "$repo") >/dev/null 2>&1; then fail "a changed tracked file should stop the deploy"; fi
git -C "$repo" checkout -q -- tracked.txt
printf 'staged
' >"${repo}/tracked.txt"
git -C "$repo" add tracked.txt
if (assert_clean_tree "$repo") >/dev/null 2>&1; then fail "a staged change should stop the deploy"; fi

printf '%s
' "deploy.sh dry-run order, Node selection and clean-tree check ok"
