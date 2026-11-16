---
title: 開発
description: capture-player の repo の置き場、ビューアの build、検査。
---

## 置き場

| path                                             | 何か                                                                                                                                                                           |
| ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `upstream/wabac.js/`・`upstream/replayweb.page/` | 上流の 2 つの repo。`git subtree --squash` で取り込み、capture-player の直しを載せた物                                                                                         |
| `src/`                                           | [replayweb-server](https://github.com/uraitakahito/replayweb-server) から写した server。ビューアを配り、S3 互換の保管庫から `/wacz/` を中継し、合本の頁の問い（`/q/`）に答える |
| `scripts/build-viewer.sh`                        | `upstream/` からビューアを Node 24 で `public/` に build する                                                                                                                  |
| `scripts/test-viewer.sh`                         | capture-player が `upstream/wabac.js/test/` に足した試験を流す                                                                                                                 |
| `scripts/check-upstream.mjs`                     | `upstream/` の下で変わったファイルが `NOTICE.md` に無ければ落ちる                                                                                                              |
| `test/`                                          | server の試験（vitest）。代役の保管庫に当てる                                                                                                                                  |
| `test-e2e/`                                      | build したビューアを headless の Chrome で開く試験。BrowserHive WACZ は `test-e2e/fixtures/`                                                                                   |
| `docs-site/`                                     | このサイト（Astro と Starlight）                                                                                                                                               |

## Node の版は 2 つ

server と検査は Node 26 で動きます（`.nvmrc`）。ビューアは Node 22〜24 で build します。上流の ReplayWeb.page の `engines` が `node <25` だからです。上流の 2 つの repo は、それぞれ自分の yarn と lockfile で入れ、pnpm の workspace には入れません。

```sh
pnpm install
NODENV_VERSION=24.15.0 pnpm run build:viewer   # ビューアを public/ に
NODENV_VERSION=24.15.0 pnpm run test:viewer    # capture-player が upstream/ に足した試験
pnpm run check                                 # server の検査（Node 26）
S3_BUCKET_URL=http://127.0.0.1:8333/browserhive node dist/main.js
```

`pnpm run check` は、[`package.json`](https://github.com/uraitakahito/capture-player/blob/main/package.json) の `check` に並ぶ物を順に流します。ビューアは build しません。

## ブラウザの試験

`pnpm run test:e2e` は、build したビューア（`pnpm run build:viewer` の `public/`）を headless の Chrome で開きます。Chrome は `CHROME_PATH`、無ければ puppeteer の置き場（`~/.cache/puppeteer`）の Chrome for Testing 156 を使います。server と試験は Node 26 で動きます。

## このサイト

```sh
pnpm run site:dev       # 書きながら見る
pnpm run site:check     # build して、リンクと en・ja の対を照らす
```

どちらも base の下に出ます。`http://localhost:4321/capture-player/` を開いてください。頁どうしのリンクは相対で書きます（`../running/`）。`/` で始まるリンクは base が抜けます。英語の頁には、`ja/` の下に同じファイル名の頁が要り、逆も同じです。無いと `site:check` が落ちます。

## CI

[`ci.yml`](https://github.com/uraitakahito/capture-player/blob/main/.github/workflows/ci.yml) は、server の検査、ビューアの build と試験、image の build と動いているコンテナへの問いを流します。`site.yml` は `site:check` を流します。`docs.yml` は、`v*` のタグが push されるとこのサイトを公開します。

## 上流の取り込みの merge

`git subtree pull` を流す PR は、squash せず merge commit で入れます。次の取り込みは、前の取り込みの commit の文の `git-subtree-dir:`・`git-subtree-split:` の行で前の取り込みを探すためです。手順は[上流への追随](../upstream/)にあります。

## リリース

リリースは、`main` の commit に打つ注釈タグ `vX.Y.Z` です。`package.json` の `version` は `0.0.1` のまま上げません。タグを push すると、このサイトが公開されます。
