#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

if git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  short_sha="$(git rev-parse --short HEAD 2>/dev/null || echo "dev")"
  commit_count="$(git rev-list --count HEAD 2>/dev/null || echo "0")"
  next_count=$((commit_count + 1))
  build_value="${short_sha}-${next_count}"
else
  build_value="dev"
fi

printf 'window.BUILD_VERSION = "%s";\n' "$build_value" > build-version.js

git add build-version.js
