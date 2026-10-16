#!/usr/bin/env sh
# Refuses a commit that stages anything under private_evidence/ (CLAUDE.md, "Private evidence").
# It is .gitignored, but `git add -f` or a renamed ignore rule could still stage it.
#
# -z prints paths unquoted: without it git quotes non-ASCII names ("\"private_evidence/...\""),
# and the Arabic file names in that folder would slip past the check.
# --diff-filter=d leaves out deletions, so a file committed by mistake can still be removed.
blocked=$(git diff --cached --name-only -z --diff-filter=d | tr '\0' '\n' | grep -i '^private_evidence/')

if [ -n "$blocked" ]; then
  echo "Commit refused: private_evidence/ is local reference material and is never committed."
  echo "Staged paths:"
  echo "$blocked" | sed 's/^/  /'
  echo "Unstage them with: git restore --staged private_evidence"
  exit 1
fi
