#!/usr/bin/env bash
set -euo pipefail

# Keep generated images out of protected main and avoid a Pages/screenshot loop.
source_revision=$(git rev-parse HEAD)
git fetch origin main
if [ "$source_revision" != "$(git rev-parse origin/main)" ]; then
  echo "Main advanced during capture; the next deployment will refresh screenshots."
  exit 0
fi

source_root=$(git rev-parse --show-toplevel)
publish_root=$(mktemp -d)
trap 'git worktree remove --force "$publish_root"' EXIT
screenshot_ref=$(git ls-remote --heads origin screenshots)
if [ -n "$screenshot_ref" ]; then
  git fetch origin screenshots
  git worktree add --detach "$publish_root" FETCH_HEAD
else
  git worktree add --detach "$publish_root" HEAD
  git -C "$publish_root" switch --orphan screenshots
fi

for name in homepage-hero homepage-mobile homepage-full-page; do
  cp "$source_root/assets/$name.png" "$publish_root/$name.png"
done
printf '%s\n' "$source_revision" > "$publish_root/source-revision.txt"
git -C "$publish_root" add homepage-hero.png homepage-mobile.png homepage-full-page.png source-revision.txt
if git -C "$publish_root" diff --cached --quiet; then
  echo "Screenshots already current."
  exit 0
fi
git -C "$publish_root" -c user.name='github-actions[bot]' -c user.email='41898282+github-actions[bot]@users.noreply.github.com' commit -m "Refresh homepage screenshots from $source_revision"
git -C "$publish_root" push origin HEAD:refs/heads/screenshots
