#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DIST_DIR="$ROOT_DIR/dist"
VERSION="$(node -p "require('$ROOT_DIR/manifest.json').version")"
ZIP_NAME="world-clock-tab-${VERSION}.zip"
ZIP_PATH="$DIST_DIR/$ZIP_NAME"

mkdir -p "$DIST_DIR"
rm -f "$ZIP_PATH"

(
  cd "$ROOT_DIR"
  zip -r "$ZIP_PATH" . \
    -x './.git/*' \
    -x './.github/*' \
    -x './.cursor/*' \
    -x './dist/*' \
    -x './scripts/*' \
    -x './screenshots/*' \
    -x './store/*' \
    -x './docs/*' \
    -x './preview-*.html' \
    -x './icons/mock/*' \
    -x './icons/brand-slots*.png' \
    -x './icons/brand-slots*.svg' \
    -x './icons/world_clock_tab.svg' \
    -x './*.zip' \
    -x './*.crx' \
    -x './.DS_Store' \
    -x './.gitignore' \
    -x './AGENTS.md' \
    -x './README.md' \
    -x './LICENSE' >&2
)

if ! unzip -l "$ZIP_PATH" | grep -q 'manifest.json'; then
  echo "error: manifest.json missing from zip root" >&2
  exit 1
fi

echo "$ZIP_PATH"
