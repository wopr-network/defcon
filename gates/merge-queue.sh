#!/usr/bin/env bash
# Gate: merge-queue — watch PR through merge queue
# Usage: gates/merge-queue.sh <pr-number> <repo>
set -euo pipefail

PR="${1:?Usage: merge-queue.sh <pr-number> <repo>}"
REPO="${2:?Usage: merge-queue.sh <pr-number> <repo>}"

"${WOPR_PR_WATCH_SCRIPT:-${WOPR_SCRIPTS_DIR:-$HOME}/wopr-pr-watch.sh}" "$PR" "$REPO" 2>&1
