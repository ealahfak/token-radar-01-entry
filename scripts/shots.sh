#!/bin/bash
# Regenerate the three screenshots from out/dashboard. Chrome headless, fixed viewport, no network.
set -euo pipefail
cd "$(dirname "$0")/.."
CH=/root/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome
TOP=$(node -e "const b=require('./out/board.json');process.stdout.write(b.rows[0].slug)")

shoot() {
  local name="$1" frag="$2"
  "$CH" --headless=new --disable-gpu --no-sandbox --hide-scrollbars \
        --window-size=1440,900 --virtual-time-budget=4000 \
        --screenshot="/tmp/shot-$name.png" "file://$PWD/out/dashboard/$frag" 2>/dev/null
  python3 -c "
from PIL import Image
import os
p='/tmp/shot-$name.png'
im=Image.open(p)
print('  $name', im.size, im.mode, round(os.path.getsize(p)/1024), 'KB')"
}

echo "top slug: $TOP"
shoot board index.html
shoot detail "index.html#d=$TOP"
shoot filtered "index.html#f=watchlist&s=tvl"
