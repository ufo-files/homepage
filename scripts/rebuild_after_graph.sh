#!/usr/bin/env bash
set -euo pipefail

: "${GITHUB_REPOSITORY:?GITHUB_REPOSITORY is required}"
previous_url="$(gh api "repos/$GITHUB_REPOSITORY/pages/builds/latest" --jq .url)"
response="$(gh api --method POST "repos/$GITHUB_REPOSITORY/pages/builds")"
build_url="$(jq -er '.url' <<<"$response")"
echo "Requested homepage Pages rebuild" >> "${GITHUB_STEP_SUMMARY:-/dev/stdout}"
if [ -f data/graph-refresh-request.json ]; then
  cat data/graph-refresh-request.json >> "${GITHUB_STEP_SUMMARY:-/dev/stdout}"
fi
for attempt in {1..48}; do
  response="$(gh api "$build_url")"
  observed_url="$(jq -er '.url' <<<"$response")"
  # The request response points to /latest, which can briefly remain the old
  # successful build. Wait for a new build, then track that specific build URL.
  if [ "$observed_url" != "$previous_url" ]; then
    build_url="$observed_url"
    status="$(jq -er '.status' <<<"$response")"
    case "$status" in
      built) exit 0 ;;
      errored) jq '.error' <<<"$response" >&2; exit 1 ;;
    esac
  fi
  sleep 15
done
echo "Homepage Pages build did not finish within twelve minutes" >&2
exit 1
