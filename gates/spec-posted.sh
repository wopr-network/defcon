#!/usr/bin/env bash
# Gate: spec-posted — verify architect spec comment exists on Linear issue
# Usage: gates/spec-posted.sh <linear-issue-id>
set -euo pipefail

LINEAR_ID="${1:?Usage: spec-posted.sh <linear-issue-id>}"

# Query Linear API for comments on the issue containing "Implementation Spec"
COMMENTS=$(gh api graphql -f query='
  query($id: String!) {
    issue(id: $id) {
      comments { nodes { body } }
    }
  }
' -f id="$LINEAR_ID" --jq '.data.issue.comments.nodes[].body' 2>&1) || {
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
