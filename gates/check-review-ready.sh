#!/usr/bin/env bash
# Gate: check-review-ready — CI green AND bot reviewers posted
# Usage: gates/check-review-ready.sh <pr-number> <repo>
set -euo pipefail

PR="${1:?Usage: check-review-ready.sh <pr-number> <repo>}"
REPO="${2:?Usage: check-review-ready.sh <pr-number> <repo>}"

# Check 1: All CI checks passing
echo "Checking CI status..."
CHECKS_OUTPUT=$(gh pr checks "$PR" --repo "$REPO" 2>&1) || { echo "ERROR: gh pr checks failed: $CHECKS_OUTPUT"; exit 1; }
if echo "$CHECKS_OUTPUT" | grep -qiE '\bfail\b'; then
  echo "CI checks failing for PR #$PR in $REPO"
  exit 1
fi
if echo "$CHECKS_OUTPUT" | grep -qiE '(pending|queued|in_progress)'; then
  echo "CI checks still pending for PR #$PR in $REPO"
  exit 1
fi
echo "CI checks passed"

# Check 2: Bot reviewers posted
echo "Checking for review bot comments..."
COMMENTS=$(gh api "repos/$REPO/issues/$PR/comments" --jq '.[].user.login' 2>/dev/null || echo "")
PR_COMMENTS=$(gh api "repos/$REPO/pulls/$PR/comments" --jq '.[].user.login' 2>/dev/null || echo "")
REVIEWS=$(gh api "repos/$REPO/pulls/$PR/reviews" --jq '.[].user.login' 2>/dev/null || echo "")
ALL_AUTHORS=$(printf '%s\n%s\n%s' "$COMMENTS" "$PR_COMMENTS" "$REVIEWS" | sort -u)

BOTS_FOUND=0
BOTS_MISSING=()
for BOT in "qodo-code-review[bot]" "coderabbitai[bot]" "sourcery-ai[bot]" "devin-ai-integration[bot]"; do
  if echo "$ALL_AUTHORS" | grep -qF "$BOT"; then
    BOTS_FOUND=$((BOTS_FOUND + 1))
  else
    BOTS_MISSING+=("$BOT")
  fi
done

if [ "$BOTS_FOUND" -eq 0 ]; then
  echo "No review bots have posted on PR #$PR: missing ${BOTS_MISSING[*]}"
  exit 1
fi

echo "Review ready: CI green, $BOTS_FOUND bot(s) posted"
exit 0
