#!/usr/bin/env bash
# deploy.sh: the order of --dry-run, where Node comes from (DEPLOY_NODE_BIN, nvm, aaPanel), the
# preflight that stops before any git command when a tool is missing, and the clean-tree check.
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
script="${root}/scripts/deploy.sh"
sha="0123456789abcdef0123456789abcdef01234567"

fail() {
  printf '%s\n' "$1" >&2
  exit 1
}

# ── The order of the steps ────────────────────────────────────────────────────────────────────
out="$(bash "$script" --dry-run "$sha")"

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
cleanup() {
  chmod -R u+rwx "$tmp" 2>/dev/null || true
  rm -rf "$tmp"
}
trap cleanup EXIT
# shellcheck source=SCRIPTDIR/deploy.sh
source "$script"

# ── Nothing in the deploy may wait for an answer: there is no terminal in the SSH session ──────
# Sourcing the script exports these itself, so this reads the script text: they must stay exported.
grep -qx 'export CI=true' "$script" ||
  fail "deploy.sh must export CI=true, or pnpm aborts when it has to replace node_modules"
grep -qx 'export COREPACK_ENABLE_DOWNLOAD_PROMPT=0' "$script" ||
  fail "deploy.sh must stop corepack from prompting for a download"

# ── The Node major comes from .nvmrc, however it is written ───────────────────────────────────
for value in "22" "v22.14.0" "22.14" "lts/*" ""; do
  expected=""
  [[ "$value" == "lts/*" || -z "$value" ]] || expected="22"
  got="$(parse_node_major "$value")"
  [[ "$got" == "$expected" ]] || fail "parse_node_major '${value}': expected '${expected}', got '${got}'"
done
printf '%s\n' "v22.14.0" >"${tmp}/nvmrc"
[[ "$(node_major "${tmp}/nvmrc")" == "22" ]] || fail "node_major of a file with v22.14.0 should be 22"
[[ -z "$(node_major "${tmp}/missing")" ]] || fail "node_major of a missing file should be empty"

# A fake Node install: <dir>/bin/node answers `-p` with its major and --version with it too.
make_node() {
  local dir="$1" major="$2"
  mkdir -p "${dir}/bin"
  # The single quotes are on purpose: the stub's own $-expressions must reach it unexpanded.
  # shellcheck disable=SC2016
  printf '#!/usr/bin/env bash\nif [[ "${1:-}" == "-p" ]]; then echo %s; else echo v%s.0.0; fi\n' \
    "$major" "$major" >"${dir}/bin/node"
  chmod +x "${dir}/bin/node"
}

# ── The newest bin of the asked major, never another major, never a dir without node ─────────
make_node "${tmp}/versions/v20.0.0" 20
make_node "${tmp}/versions/v22.3.0" 22
make_node "${tmp}/versions/v22.14.0" 22
make_node "${tmp}/versions/v24.1.0" 24
mkdir -p "${tmp}/versions/v22.99.0/bin" # no executable node in it: skipped
[[ "$(newest_node_bin "${tmp}/versions" 22)" == "${tmp}/versions/v22.14.0/bin" ]] ||
  fail "expected the newest v22 bin"
[[ "$(newest_node_bin "${tmp}/versions" 24)" == "${tmp}/versions/v24.1.0/bin" ]] ||
  fail "expected the v24 bin"
[[ -z "$(newest_node_bin "${tmp}/versions" 18)" ]] || fail "no Node 18 is installed: expected empty"
[[ -z "$(newest_node_bin "${tmp}/absent" 22)" ]] || fail "an absent root should give empty"

# ── The preflight: tools first, no git command until they all pass ────────────────────────────
tools="${tmp}/tools"
mkdir -p "$tools" "${tmp}/repo"
gitlog="${tmp}/git.log"
# The single quotes are on purpose: the stub's own $-expressions must reach it unexpanded.
# shellcheck disable=SC2016
printf '#!/usr/bin/env bash\nprintf "%%s\\n" "$*" >>"%s"\n' "$gitlog" >"${tools}/git"
printf '#!/usr/bin/env bash\necho 10.28.0\n' >"${tools}/pnpm"
for name in pm2 curl rsync; do
  printf '#!/usr/bin/env bash\nexit 0\n' >"${tools}/${name}"
done
chmod +x "${tools}"/*

# A PATH that holds only the stubs and thin wrappers of the system tools the script uses, so "a tool
# is missing" means the same on every machine: the runner has git, curl and rsync in /usr/bin, and
# those must not leak into a test about them being absent.
sysbin="${tmp}/sysbin"
mkdir -p "$sysbin"
for name in bash head sort tail id date dirname; do
  # The single quotes are on purpose: "$@" must reach the wrapper unexpanded.
  # shellcheck disable=SC2016
  printf '#!%s
exec "%s" "$@"
' "$(command -v bash)" "$(command -v "$name")" >"${sysbin}/${name}"
  chmod +x "${sysbin}/${name}"
done
printf '22\n' >"${tmp}/repo/.nvmrc"

# Runs `deploy.sh preflight` the way the workflow does (NVMRC_VALUE from the commit's .nvmrc), in
# a clean environment: only the stub tools and the system utilities are on PATH. Sets $out, $rc.
run_preflight() {
  : >"$gitlog"
  if out="$(
    env -i HOME="${tmp}/home" PATH="${tools}:${EXTRA_PATH:-}:${sysbin}" \
      DEPLOY_ROOT="${tmp}/repo" NVM_NODE_ROOT="${tmp}/home/.nvm/versions/node" \
      AAPANEL_NODE_HOME="${tmp}/aapanel" NVMRC_VALUE="${NVMRC_FOR_TEST-22}" \
      DEPLOY_NODE_BIN="${DEPLOY_NODE_BIN_FOR_TEST:-}" \
      bash "$script" preflight "$sha" 2>&1
  )"; then
    rc=0
  else
    rc=$?
  fi
}

# 1. Node only in the deploy user's nvm; aaPanel's tree is there but this user cannot enter it.
make_node "${tmp}/home/.nvm/versions/node/v22.3.0" 22
make_node "${tmp}/home/.nvm/versions/node/v22.14.0" 22
make_node "${tmp}/home/.nvm/versions/node/v24.1.0" 24
make_node "${tmp}/aapanel/v22.9.0" 22
chmod 000 "${tmp}/aapanel"
run_preflight
[[ "$rc" -eq 0 ]] || fail "preflight with Node in nvm should pass (rc=${rc}): ${out}"
[[ "$out" == *"from nvm: ${tmp}/home/.nvm/versions/node/v22.14.0/bin"* ]] ||
  fail "should say it chose the newest nvm Node: ${out}"
[[ "$out" != *"Permission denied"* ]] || fail "an unreadable aaPanel tree must be skipped quietly: ${out}"
grep -q 'cat-file' "$gitlog" || fail "preflight should check that the commit is known"
if grep -qE 'fetch|checkout|reset|clean|pull' "$gitlog"; then
  fail "preflight must not change the repository: $(cat "$gitlog")"
fi

# 2. No nvm, aaPanel unreadable: not fatal, node comes from PATH. Where chmod is not enforced (git
# bash on Windows) the tree stays readable, so it is removed instead: the same "nothing to use".
rm -rf "${tmp}/home/.nvm"
if [[ -r "${tmp}/aapanel" ]]; then
  chmod 755 "${tmp}/aapanel"
  rm -rf "${tmp}/aapanel"
fi
mkdir -p "${tmp}/pathnode"
make_node "${tmp}/pathnode" 22
EXTRA_PATH="${tmp}/pathnode/bin" run_preflight
[[ "$rc" -eq 0 ]] || fail "preflight with node on PATH should pass (rc=${rc}): ${out}"
[[ "$out" == *"using node from PATH"* ]] || fail "should say it uses node from PATH: ${out}"

# 3. DEPLOY_NODE_BIN wins over nvm and aaPanel.
make_node "${tmp}/home/.nvm/versions/node/v22.14.0" 22
make_node "${tmp}/custom" 22
DEPLOY_NODE_BIN_FOR_TEST="${tmp}/custom/bin" run_preflight
[[ "$rc" -eq 0 && "$out" == *"from DEPLOY_NODE_BIN: ${tmp}/custom/bin"* ]] ||
  fail "DEPLOY_NODE_BIN should be used (rc=${rc}): ${out}"

# 4. A DEPLOY_NODE_BIN without node is a typo: stop, before any git command.
DEPLOY_NODE_BIN_FOR_TEST="${tmp}/nowhere/bin" run_preflight
[[ "$rc" -ne 0 && "$out" == *"has no executable node"* ]] || fail "a bad DEPLOY_NODE_BIN should stop: ${out}"
[[ ! -s "$gitlog" ]] || fail "no git command may run before the tools pass: $(cat "$gitlog")"

# 5. A missing tool stops before any git command runs.
for missing in pm2 pnpm git curl rsync; do
  mv "${tools}/${missing}" "${tools}/${missing}.off"
  run_preflight
  mv "${tools}/${missing}.off" "${tools}/${missing}"
  [[ "$rc" -ne 0 && "$out" == *"missing command: ${missing}"* ]] ||
    fail "a missing ${missing} should stop the preflight (rc=${rc}): ${out}"
  [[ ! -s "$gitlog" ]] || fail "no git command may run when ${missing} is missing: $(cat "$gitlog")"
done

# 6. A Node of the wrong major stops before any git command runs.
make_node "${tmp}/old" 24
DEPLOY_NODE_BIN_FOR_TEST="${tmp}/old/bin" run_preflight
[[ "$rc" -ne 0 && "$out" == *"node is v24 but .nvmrc asks for 22"* ]] ||
  fail "a wrong Node major should stop (rc=${rc}): ${out}"
[[ ! -s "$gitlog" ]] || fail "no git command may run on a wrong Node major: $(cat "$gitlog")"

# 7. The commit's .nvmrc decides, not the checkout that is still the old commit.
NVMRC_FOR_TEST="v24.0.0" run_preflight
[[ "$rc" -ne 0 ]] || fail "a .nvmrc of 24 with Node 22 installed should stop: ${out}"

# 8. No .nvmrc at all stops with a clear line.
rm "${tmp}/repo/.nvmrc"
NVMRC_FOR_TEST="" run_preflight
[[ "$rc" -ne 0 && "$out" == *"cannot read the Node major"* ]] || fail "a missing .nvmrc should stop: ${out}"
printf '22\n' >"${tmp}/repo/.nvmrc"

# 9. The way the workflow runs it: the script arrives on stdin (git show | bash -s).
: >"$gitlog"
if out="$(
  env -i HOME="${tmp}/home" PATH="${tools}:${sysbin}" DEPLOY_ROOT="${tmp}/repo" \
    NVM_NODE_ROOT="${tmp}/home/.nvm/versions/node" AAPANEL_NODE_HOME="${tmp}/aapanel" \
    NVMRC_VALUE="v22.14.0" bash -s -- preflight "$sha" <"$script" 2>&1
)"; then
  rc=0
else
  rc=$?
fi
[[ "$rc" -eq 0 && "$out" == *"preflight ok for ${sha}"* ]] || fail "preflight from stdin failed (rc=${rc}): ${out}"

# ── Hand edits of tracked files stop the deploy; untracked and ignored files do not ───────────
repo="${tmp}/gitrepo"
git init -q "$repo"
git -C "$repo" config user.email test@example.com
git -C "$repo" config user.name test
printf 'one\n' >"${repo}/tracked.txt"
printf 'ignored.txt\n' >"${repo}/.gitignore"
git -C "$repo" add .
git -C "$repo" commit -q -m init
(assert_clean_tree "$repo") >/dev/null || fail "a clean tree should pass"
printf 'x\n' >"${repo}/untracked.txt"
printf 'x\n' >"${repo}/ignored.txt"
(assert_clean_tree "$repo") >/dev/null || fail "untracked and ignored files should pass"
printf 'two\n' >"${repo}/tracked.txt"
if (assert_clean_tree "$repo") >/dev/null 2>&1; then fail "a changed tracked file should stop the deploy"; fi
git -C "$repo" checkout -q -- tracked.txt
printf 'staged\n' >"${repo}/tracked.txt"
git -C "$repo" add tracked.txt
if (assert_clean_tree "$repo") >/dev/null 2>&1; then fail "a staged change should stop the deploy"; fi

printf '%s\n' "deploy.sh dry-run order, Node selection, preflight and clean-tree check ok"
