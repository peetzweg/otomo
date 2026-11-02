#!/usr/bin/env bash
# Renders the share image into public/og.png (1200×630) from scripts/og/card.html. Needs Google Chrome.
# Run from the repo root: scripts/og/render.sh
set -euo pipefail

CHROME="${CHROME:-/Applications/Google Chrome.app/Contents/MacOS/Google Chrome}"
"$CHROME" --headless=new --disable-gpu --hide-scrollbars --force-device-scale-factor=1 \
  --window-size=1200,630 --screenshot=public/og.png "file://$PWD/scripts/og/card.html" 2>/dev/null
ls -la public/og.png
