#!/usr/bin/env bash
# capture-player が upstream/ に足した試験（ファイル名が capturePlayer で始まる物）を流す。
# 上流の試験の全部は流さない。build-viewer.sh の後に、同じ Node 22〜24 で。
set -euo pipefail
root=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
export COREPACK_ENABLE_DOWNLOAD_PROMPT=0
cd "$root/upstream/wabac.js"
corepack yarn ava 'test/capturePlayer*.ts'
