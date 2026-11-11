#!/usr/bin/env bash
# ビューア（upstream/ の wabac.js と replayweb.page）を build し、server が配る 6 つを置き場に揃える。
#
#   bash scripts/build-viewer.sh [置き場]      # 既定は public/（server の既定の staticDir）
#
# - Node 22〜24 で走らせる（上流の replayweb.page の engines が node >=22 <25）。手元の nodenv なら
#   `NODENV_VERSION=24.15.0 pnpm run build:viewer`。server（src/）は Node 26 のまま。
# - 上流の 2 つは、それぞれ自分の yarn（corepack・4.17.1）と lockfile で入れる。pnpm の workspace に入れない。
# - replayweb.page の webpack は filesystem の cache を持ち、wabac を直しても sw.js を写し直さないことがある
#   （2026-11-12 に踏んだ）。毎回 node_modules/.cache を消す。
# - GIT_TAG・GIT_REV が在れば /__version と /SOURCE.txt と About に入れる（Dockerfile が渡す）。
set -euo pipefail

root=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
out=${1:-"$root/public"}

major=$(node -p 'process.versions.node.split(".")[0]')
if [ "$major" -lt 22 ] || [ "$major" -gt 24 ]; then
  echo "build-viewer: Node 22〜24 で走らせてください（いまは $(node -v)）。手元なら NODENV_VERSION=24.15.0" >&2
  exit 1
fi

export COREPACK_ENABLE_DOWNLOAD_PROMPT=0

cd "$root/upstream/wabac.js"
corepack yarn install --immutable
corepack yarn build

cd "$root/upstream/replayweb.page"
rm -rf node_modules/.cache
corepack yarn install --immutable
corepack yarn run webpack --mode production --config webpack.capture-player.cjs

rwp=$(node -p 'require("./package.json").version')
wabac=$(node -p 'require("../wabac.js/package.json").version')
tag=${GIT_TAG:-}
rev=${GIT_REV:-dev}

mkdir -p "$out"
cp index.html ui.js sw.js "$out/"
cp "$root/LICENSE" "$out/LICENSE"
printf '{"version":"%s","revision":"%s","replaywebpage":"%s","wabac":"%s"}\n' \
  "${tag:-unknown}" "$rev" "$rwp" "$wabac" > "$out/__version"
printf 'capture-player %s (%s)\nlicense: AGPL-3.0-or-later\nsource: https://github.com/uraitakahito/capture-player/tree/%s\nbased on: replayweb.page %s and wabac.js %s by Webrecorder (modified; see NOTICE.md)\n' \
  "${tag:-unknown}" "$rev" "${tag:-main}" "$rwp" "$wabac" > "$out/SOURCE.txt"
echo "build-viewer: ${out} に 6 つを置いた（replayweb.page ${rwp}・wabac.js ${wabac}・${tag:-タグなし}）"
