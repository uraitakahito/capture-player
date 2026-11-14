# e2e の見本

どれも BrowserHive が dev の一式（capture-fixtures の頁）で撮った WACZ。2026-11-12 に保管庫から読んだ。

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
