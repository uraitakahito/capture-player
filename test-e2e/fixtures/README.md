# e2e の見本

どれも BrowserHive が dev の一式（capture-fixtures の頁）で撮った WACZ。2026-11-12 に保管庫から読んだ。

| ファイル                  | 元                                                                                           | 何を見るか                                 |
| ------------------------- | -------------------------------------------------------------------------------------------- | ------------------------------------------ |
| `snapshots.wacz`          | `409d7ff3-…_e895a212-….wacz`（`/plain-html`）                                                | 写しの 2 行（after-load・after-behaviors） |
| `signed-der.wacz`         | `snapshots.wacz` の `datapackage-digest.json` を、wacz-signer v0.9.0 の DER の署名に替えた物 | DER の署名を照合できる                     |
| `signed-tampered.wacz`    | `signed-der.wacz` の署名の 11 バイト目の 1 ビットを反転                                      | 照合に落ち、invalid に数える               |
| `truncated-document.wacz` | `c1208b32-…__e2e.wacz`（BrowserHive の e2e。文書が `WARC-Truncated: length`・本文 0 バイト） | 本文を残さなかった文書の帯                 |

署名の証明書は、試験のためだけに `wacz-signer init --domain signer.example.invalid` で作った自己署名の CA の物。
| `no-browserhive.wacz` | `snapshots.wacz` の `datapackage.json` から `browserhive:capture` だけを抜いた物 | BrowserHive の欄が出ない（他の作り手の WACZ の代わり） |
