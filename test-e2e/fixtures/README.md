# e2e の見本

最初の表の見本は、BrowserHive が dev の一式（capture-fixtures の頁）で撮った WACZ を 2026-11-12 に保管庫から読んだ物と、
それを替えた物。後ろの節（合本・乱数の控え・撮った時の窓）の見本は、撮り方と日が違うので、由来を節ごとに書く。

| ファイル                  | 元                                                                                           | 何を見るか                                                        |
| ------------------------- | -------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| `snapshots.wacz`          | `409d7ff3-…_e895a212-….wacz`（`/plain-html`）                                                | 写しの 2 行（after-load・after-behaviors）                        |
| `signed-der.wacz`         | `snapshots.wacz` の `datapackage-digest.json` を、wacz-signer v0.9.0 の DER の署名に替えた物 | DER の署名を照合できる                                            |
| `signed-tampered.wacz`    | `signed-der.wacz` の署名の 11 バイト目の 1 ビットを反転                                      | 照合に落ち、invalid に数える                                      |
| `truncated-document.wacz` | `c1208b32-…__e2e.wacz`（BrowserHive の e2e。文書が `WARC-Truncated: length`・本文 0 バイト） | 本文を残さなかった文書の帯                                        |
| `no-browserhive.wacz`     | `snapshots.wacz` の `datapackage.json` から `browserhive:capture` だけを抜いた物             | BrowserHive の欄が出ない（BrowserHive WACZ でない WACZ の代わり） |

署名の証明書は、試験のためだけに `wacz-signer init --domain signer.example.invalid` で作った自己署名の CA の物。

## 合本（`bucket/`・CAPTURE-245）

`frames.test.ts` が使う。`bucket/` を保管庫の代わりに配り（`startViewer(<配信>/bucket)`）、`/wacz/` と `/q/` を通す。

| ファイル                                                                                   | 元                                                                                                                                                                                                                                                                                   |
| ------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `bucket/frames/*.wacz`（6 本）                                                             | capture-fixtures v0.35.0 の `/links/frameset`・`/links/iframe`・`/links/leaf/1`・`/links/leaf/3`・`/links/hub`・`/links/leaf/2` を、手元の BrowserHive（枝 `feat/c245-frame-links` の dist・Chrome for Testing 156）で 1 本ずつ撮った物。2026-11-12。頁は `127.0.0.1:18185` で配った |
| `bucket/org/test/crawls/00000000-0000-4000-8000-000000000245/r1/pages.json`・`replay.json` | capture-ledger が書く形（`pagesQueryUrl` つき・クロールの id は 1 つ・`isSeed` は frameset だけ）に、6 本から組んだ物                                                                                                                                                                |

**並びが要。** 押す先の `leaf-2.wacz` は、`resources` では 6 番目、名前の順では 5 番目に在る。上流の wabac.js（`upstream/wabac.js/src/wacz/multiwacz.ts` の `getWACZFilesToTry`・:1408-1499）は、頁の問い（`pagesQueryUrl`）を使わない要求では、要求が名指す WACZ のクロールに起点の頁（`isSeed`）が在ればその WACZ を（:1480-1488）、無ければ WACZ の一覧の先頭 3 本（`maxFallbackLookups`・:107・:1491-1498）だけを探す。この 3 本は `resources` の順ではなく **WACZ の名前の順** で選ばれる。2026-11-14 に CAPTURE-245 の改変を外して確かめた: いまの見本は frameset・hub・iframe の 3 本を読んで Not Found／`leaf-2.wacz` を名前の順で先頭に来る名前にすると（`resources` では 6 番目のまま）見つかる／名前を替えずに `resources` の 1 番目に動かしても Not Found。同じ context で 2 度目に開いても同じ。`<frame>` の中の遷移は、実測ではこの先頭 3 本の道に入った。名前の順で 3 本以内に置くと直しが無くても見つかり、試験が反証にならない。

## 乱数の控え（`random-*.wacz`・CAPTURE-378）

`random.test.ts` が使う。4 本は BrowserHive の e2e が dev の一式（capture-fixtures の `/random/*`）で撮った本物
（BrowserHive v31.1.0 の build `ef8bf97e`・`datapackage.json` の `software` は `browserhive/31.0.0+5.gef8bf97e`・
WACZ Profile 1.26.0）。2026-11-14 に保管庫から写した（撮ったのは 08:47 UTC 頃）。頁は
`http://capture-fixtures-1-a.browserhive:8080/random/...`。残りの 2 本は `random-pick.wacz` から
`node test-e2e/fixtures/derive-random.ts` で作る（変えないエントリは圧縮したバイト列をそのまま写す。何度流しても
同じバイト列）。

| ファイル               | 元                                                                                                                                                                                         | 何を見るか                                                        |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------- |
| `random-pick.wacz`     | `e2e-146.wacz`（`/random/pick`。document の行 1 つ・`pick.js` の `Math.random` の draw 1 つ・値 0.9604632342795921）                                                                       | 960463 を選び、その絵が出る。再生の帯に印                         |
| `random-frame.wacz`    | `e2e-150.wacz`（`/random/frame` と、同じサイトの iframe の `/random/pick`。draw は frame の文書（`document` 1・`frame: "frame"`）の物・値 0.70543710049348）                               | iframe の中で 705437。帯の数に入る                                |
| `random-twice.wacz`    | `e2e-153.wacz`（`devicePixelRatios` [1, 2] で `/random/pick` を 2 度読んだ物。document の行 2 つ（dpr 1・2、record と date が別）・値 0.3193780804432035 と 0.8710058479768352）           | 2 つ目の文書の時刻（`20261114084739`）で 871005、1 つ目で 319378  |
| `random-bytes.wacz`    | `e2e-148.wacz`（`/random/bytes`。`crypto.getRandomValues` の draw 1 つ・`bytes` 4・値 `AOvwqQ==`）                                                                                         | 4 バイトを `Uint32Array` で読んだ数の下 6 桁 138304               |
| `random-none.wacz`     | `random-pick.wacz` から `random/values.jsonl`・`random/recorder.js` と、その `resources` の行と、`browserhive:capture.random` を抜いた物。`datapackage-digest.json` の hash は合わなくなる | 今までどおり wombat の固定の種の 712229。挿し込みに script が無い |
| `random-tampered.wacz` | `random-pick.wacz` の `random/values.jsonl` の値の最後の 1 字を変えた物（0.9604632342795921 → …922。JSON のまま、n は同じ）。`resources` の hash はそのまま                                | hash が合わないので使わない（712229）                             |

控えが無いときに wombat の固定の種（種は文書の記録の時刻の秒）が出す数は、`random.test.ts` の「見本の前提」が
計算し、控えから決まる数と違うことを確かめる。

## 撮った時の窓（`viewport-*.wacz`・`bucket/viewport/`・CAPTURE-422）

`viewport.test.ts` が使う。capture-fixtures v0.37.0 の `/viewport/*`（窓の幅・高さ・DPR で絵の版を選ぶ頁。どの絵も自分の名前を
描いた SVG）を、手元で起こした capture-fixtures（`127.0.0.1:19461`）と、手元の BrowserHive（v31.1.0 のタグから build した写し。
`datapackage.json` の版は `31.1.0+local`。ループバックを撮れるように 1 行だけ替えた。Chrome for Testing 156）で、2026-11-14 12:00 UTC
頃に 1 本ずつ撮った物。保管庫もコンテナも使っていない。頁は `http://127.0.0.1:19461/viewport/...`。

| ファイル                       | 撮り方                                                                 | 記録に在る絵       |
| ------------------------------ | ---------------------------------------------------------------------- | ------------------ |
| `viewport-picture-width.wacz`  | `/viewport/picture-width`・1280×800・DPR [1]                           | `width-l-1x`       |
| `viewport-picture-height.wacz` | `/viewport/picture-height`・1280×800・DPR [1]                          | `height-tall-1x`   |
| `viewport-js-dpr.wacz`         | `/viewport/js-dpr`・1280×800・DPR [1]                                  | `js-1x`            |
| `viewport-js-height.wacz`      | `/viewport/js-height`・1280×800・DPR [1]                               | `jsheight-tall`    |
| `viewport-image-set.wacz`      | `/viewport/image-set`・1280×800・DPR [1]                               | `set-1x`・`res-1x` |
| `viewport-js-dpr-twice.wacz`   | `/viewport/js-dpr`・1280×800・DPR [1, 2]（乱数の控えなし）             | `js-1x`・`js-2x`   |
| `viewport-narrow.wacz`         | `/viewport/picture-width`・1000×700・DPR [1]（窓の決め打ちを見分ける） | `width-m-1x`       |

`bucket/viewport/picture-width.wacz`・`narrow.wacz` は上の 2 本の写しで、
`bucket/org/test/crawls/00000000-0000-4000-8000-000000000422/r1/` の `pages.json`・`replay.json` が束ねる（同じ URL を別の窓で
撮った 2 本。capture-ledger が書く形）。

## 頁の一覧の絵（CAPTURE-440）

`thumbnails.test.ts` が使う。上の 3 本は capture-workbench v0.54.0 の `sandbox/samples/` から 2026-11-15 に写した物
（BrowserHive v30.2.0 の e2e が capture-fixtures を 2026-11-13 に撮った WACZ。撮り方は capture-workbench の
`sandbox/samples/SOURCE.md` の「BrowserHive の e2e の取り込みの 3 本」）。sha256 は SOURCE.md の値と照らした。
`thumbnail-only.wacz` と `bucket/thumbnails/pick-no-shot.wacz` は `random-pick.wacz` から
`node test-e2e/fixtures/derive-random.ts` で作る（「乱数の控え」と同じ作り方）。

| ファイル                              | 元                                                                                                                                                                                                                                                                                  | 何を見るか                                                                     |
| ------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| `with-screenshots.wacz`               | `/marked/search/public` を検索するスクリプトつきで撮った物。節目のスクリーンショットが 2 枚（after-load は検索の前・after-behaviors は検索の後で、文書の URL も違う）。sha256 `abe9294e…`                                                                                           | 文書の行に after-load、写しの行に同じ時点の絵。1280×800 の絵を歪めない         |
| `without-screenshots-secret.wacz`     | `/plain-html` をシークレットつきで撮った物。どの時点の絵も残していない（`skipped: secret`）。sha256 `5c6c28c2…`                                                                                                                                                                     | 絵の無い行は今までどおりの代わりの箱                                           |
| `without-screenshots-withheld.wacz`   | `/marked/text/secret` を content-type の方針で伏せた物。絵を残していない（`skipped: withheld`）。sha256 `2db7f5a6…`                                                                                                                                                                 | 同上                                                                           |
| `thumbnail-only.wacz`                 | `random-pick.wacz` の after-load の絵のレコードを写して `WARC-Target-URI` だけを `urn:thumbnail:<頁の url>` に替えた物を WARC の後ろに足し、索引の絵の行をそれを指す行に替えた物。wabac.js は索引の url とレコードの `WARC-Target-URI` が違うと読まないので、索引だけは替えられない | 上流の名前の絵だけを持つ WACZ では、それを出す。並べ替えても絵が自分の行に付く |
| `bucket/thumbnails/pick.wacz`         | `random-pick.wacz` の写し                                                                                                                                                                                                                                                           | 合本で、同じ URL の別の回                                                      |
| `bucket/thumbnails/twice.wacz`        | `random-twice.wacz` の写し                                                                                                                                                                                                                                                          | 同上                                                                           |
| `bucket/thumbnails/pick-no-shot.wacz` | `random-pick.wacz` の索引から絵の行を抜いた物（WARC は替えない）                                                                                                                                                                                                                    | 合本で、絵の無い回                                                             |

合本は 2 つ。どちらも capture-ledger が書く形（`initialPages` は文書の行だけ）に、手で組んだ物:

- `bucket/org/test/crawls/00000000-0000-4000-8000-000000000440/r1/`: `pick.wacz`・`twice.wacz`（同じ URL を 2 回撮った 2 本。
  絵も違う）
- `bucket/org/test/crawls/00000000-0000-4000-8000-000000000441/r1/`: `twice.wacz`・`pick-no-shot.wacz`（同じ URL の、絵の在る回と
  無い回）

合本の一覧は、日付の見出しを押しても並びが変わらない（2026-11-15 に確かめた。一覧の並べ替え（`pages.ts`）は上流のまま）。並べ替えの試験は 1 本の WACZ で見る。

## 子フレームの写し（`frame-snapshots*.wacz`・`bucket/frame-snapshots/`・CAPTURE-147）

`frame-snapshots.test.ts` が使う。capture-fixtures v0.38.0 の頁を、手元で起こした capture-fixtures（v0.38.0 のタグから build・
`127.0.0.1:19471`）と、手元の BrowserHive（v31.2.0 のタグから build した写し。`datapackage.json` の版は `31.2.0+local`。
ループバックを撮れるように 1 行だけ替えた。Chrome for Testing 156）で、2026-11-14 20:47〜20:52 UTC に 1 本ずつ撮った物。
保管庫もコンテナも使っていない。頁は `http://127.0.0.1:19471/...`。どれも 1280×800・DPR [1]・WACZ Profile 1.27.0。

取り込みには、その場のスクリプトを 1 本（id `marker`）付けた。枠を前順にたどり、名前が `right` の枠の文書の body に
`<p data-capture-script="marker">frame snapshot marker</p>` を、`menu`・`left` の枠の文書に
`<p data-capture-script="menu-marker">menu snapshot marker</p>` を足す。印は after-behaviors の子の写しにだけ在り、記録した
元の文書（response）と after-load の写しには無い。スクリプトの中身は各 WACZ の `behaviors/custom.jsonl` に残っている。

| ファイル                                                            | 頁                       | 子の写し（after-behaviors）                                                                 |
| ------------------------------------------------------------------- | ------------------------ | ------------------------------------------------------------------------------------------- |
| `frame-snapshots.wacz`・`bucket/frame-snapshots/portrait.wacz`      | `/portrait/`             | 1 `menu.htm`（menu-marker）・2 `top.htm`（marker。絵 `mona.jpg` を参照）                    |
| `frame-snapshots-nested.wacz`・`bucket/frame-snapshots/nested.wacz` | `/links/frameset-nested` | 1 `/links/frameset`・2 `/links/frame/menu`（menu-marker）・3 `/links/frame/empty`（marker） |
| `frame-snapshots-iframe.wacz`・`bucket/frame-snapshots/iframe.wacz` | `/links/iframe`          | 1 `/links/frame/menu`（iframe・menu-marker）                                                |
| `bucket/frame-snapshots/frameset.wacz`                              | `/links/frameset`        | 1 `/links/frame/menu`（menu-marker）・2 `/links/frame/empty`（marker）                      |

4 本とも wacz-validator v0.51.0 の `--profile browserhive` で failed 0（`browserhive/frame-snapshots` を含む）。子の写しの
metadata の `document-record` は、どれも同じ WARC の子の文書の response の `WARC-Record-ID` を名指す。

`bucket/org/test/crawls/00000000-0000-4000-8000-000000000147/r1/` の `pages.json`・`replay.json` が 4 本を束ねる（capture-ledger が
書く形に、4 本の `pages/pages.jsonl` から組んだ物。写しの行は `keys` が空）。写しの行は頁の問いでは見つからないので、試験は頁の一覧の
リンクと同じく `waczhash` で WACZ を名指して開く。名前の順で `portrait.wacz` は 4 番目。
