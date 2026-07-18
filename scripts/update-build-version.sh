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

python3 - <<'PY' "$build_value"
import pathlib, re, sys
path = pathlib.Path('index.html')
text = path.read_text()
pattern = re.compile(r'<script\s+src="\./build-version\.js(?:\?v=[^"]*)?"></script>')
new = f'<script src="./build-version.js?v={sys.argv[1]}"></script>'
new_text, count = pattern.subn(new, text, count=1)
if count != 1:
    raise SystemExit('build-version script tag not found')
path.write_text(new_text)
PY

git add build-version.js *.html