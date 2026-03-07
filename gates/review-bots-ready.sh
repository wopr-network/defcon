#!/usr/bin/env bash
# Gate: review-bots-ready — wait for review bots to post
# Usage: gates/review-bots-ready.sh <pr-number> <repo>
set -euo pipefail

PR="${1:?Usage: review-bots-ready.sh <pr-number> <repo>}"
REPO="${2:?Usage: review-bots-ready.sh <pr-number> <repo>}"

~/wopr-await-reviews.sh "$PR" "$REPO" 2>&1
