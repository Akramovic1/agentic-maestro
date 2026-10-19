#!/bin/bash
# Builds the Agensi upload: dist/agentic-maestro-agensi.zip with SKILL.md at the zip root and only
# the text files an agent needs (no media, no installer, no repo tooling).
# Usage: tools/build-agensi.sh        Exit: 0 built; 1 a required file is missing or zip failed.
set -euo pipefail
ROOT=$(cd "$(dirname "$0")/.." && pwd -P)
OUT="$ROOT/dist"
STAGE=$(mktemp -d)
trap 'find "$STAGE" -depth -delete' EXIT

cd "$ROOT"
cp SKILL.md LICENSE "$STAGE/"
cp packaging/agensi/README.md "$STAGE/README.md"
mkdir -p "$STAGE/references" "$STAGE/templates" "$STAGE/scripts"
cp references/*.md "$STAGE/references/"
cp templates/*.md templates/*.json "$STAGE/templates/"
cp scripts/*.sh scripts/*.mjs scripts/*.py "$STAGE/scripts/"
chmod 755 "$STAGE"/scripts/*.sh "$STAGE"/scripts/*.mjs

mkdir -p "$OUT"
ZIP="$OUT/agentic-maestro-agensi.zip"
[ -e "$ZIP" ] && find "$ZIP" -delete
(cd "$STAGE" && zip -q -X -r "$ZIP" .)
echo "built $ZIP ($(wc -c < "$ZIP" | tr -d ' ') bytes, $(cd "$STAGE" && find . -type f | wc -l | tr -d ' ') files)"
