#!/usr/bin/env bash
# Gate: spec-posted — verify architect spec comment exists on Linear issue
# Usage: gates/spec-posted.sh <linear-issue-id>
set -euo pipefail

LINEAR_ID="${1:?Usage: spec-posted.sh <linear-issue-id>}"

# Query Linear API for comments on the issue containing "Implementation Spec"
LINEAR_API_KEY="${LINEAR_API_KEY:?LINEAR_API_KEY env var is required}"
COMMENTS=$(curl -s -X POST "https://api.linear.app/graphql" \
  -H "Authorization: ${LINEAR_API_KEY}" \
  -H "Content-Type: application/json" \
  -d "{\"query\":\"query { issue(id: \\\"${LINEAR_ID}\\\") { comments { nodes { body } } } }\"}" \
  | grep -o '"body":"[^"]*"' | sed 's/"body":"//;s/"$//' 2>&1) || {
  echo "Failed to query Linear API: $COMMENTS"
  exit 1
}

if echo "$COMMENTS" | grep -q "Implementation Spec"; then
  echo "Spec comment found on issue $LINEAR_ID"
  exit 0
else
  echo "No spec comment found on issue $LINEAR_ID"
  exit 1
fi
