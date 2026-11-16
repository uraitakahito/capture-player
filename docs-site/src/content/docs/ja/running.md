---
title: 動かす
description: capture-player の server の環境変数・port・配る物。
---

capture-player は Node の process 1 つで動きます（`node dist/main.js`。image の入口）。ビューアを配り、S3 互換の保管庫から WACZ を中継し、合本の頁の問いに答えます。ほかからは何も取りに行かず、CORS の header も付けません。

## 環境変数

| 変数            | 既定                                                | 何か                                                                                          |
| --------------- | --------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| `S3_BUCKET_URL` | `http://seaweedfs.crawler-storage:8333/browserhive` | 読む bucket。形は `http(s)://<host>[:<port>]/<bucket>`。bucket は名乗らずに読める物にします。 |
| `TLS_CERT`      | （無し）                                            | PEM の証明書。`TLS_KEY` と揃うと、443 でも待ちます。                                          |
| `TLS_KEY`       | （無し）                                            | 証明書の秘密鍵。                                                                              |

既定の bucket は、Web Capture の repo が共有する保管庫です（[seaweedfs](https://github.com/uraitakahito/seaweedfs)、project `crawler-storage`）。この image を動かすスタックは `S3_BUCKET_URL` を自分で書きます。既定は image を単独で動かすときのための物です。

次のときは起きずに、標準エラーに `FATAL:` の 1 行を出して止まります。

- `S3_BUCKET_URL` が `http(s)://<host>[:<port>]/<bucket>` の形でない（host が無い、bucket が無い、user か password がある、query か fragment がある）。文は `FATAL: S3_BUCKET_URL must be http(s)://<host>[:<port>]/<bucket>, got: …` です。
- `TLS_CERT` と `TLS_KEY` の片方だけがある。そのまま起きると、暗号化したつもりで平文になるためです。
- 証明書か鍵のファイルが読めない。

`/etc/resolv.conf` に `nameserver` の行が無いときは、知らせを出して起きます。壊れるのは保管庫に届かない `/wacz/` と `/q/` だけです。保管庫の host の名前は要求ごとに引くので、server が起きる時に保管庫が起きている必要はありません。

## port

- **8080** — 平文の HTTP/1.1。いつも開きます。
- **443** — TLS の HTTP/2 と HTTP/1.1。`TLS_CERT` と `TLS_KEY` があるときだけ開きます。8080 も開いたままです。

image の中では、443 を開くために root で起き、開いた後に `node` の user に降ります。`SIGTERM` と `SIGINT` は自分で受け（PID 1 で動くため）、走っている要求を少し待ってから exit 0 で終わります。

## 配る物

| path                                   | 何か                                              |
| -------------------------------------- | ------------------------------------------------- |
| `/wacz/<鍵>`                           | 保管庫の `<S3_BUCKET_URL>/<鍵>`                   |
| `/q/<置き場>/pages`                    | 合本の頁の問い。合本の `pages.json` から答えます  |
| `/`・`/index.html`・`/ui.js`・`/sw.js` | ビューア                                          |
| `/__version`                           | capture-player のタグと revision、上流の版の JSON |
| `/SOURCE.txt`                          | この build のソースの在処（AGPL-3.0 の §13）      |
| `/LICENSE`                             | ライセンスの文                                    |

ほかは 404 です。ビューアのファイルの一覧は [`src/static.ts`](https://github.com/uraitakahito/capture-player/blob/main/src/static.ts) にあります。

合本の形、頁の問い、`/wacz/` の鍵の綴りは、この server の写し元の [replayweb-player](https://github.com/uraitakahito/replayweb-player) が決めています（[`docs/replay-bundle.md`](https://github.com/uraitakahito/replayweb-player/blob/main/docs/replay-bundle.md)）。

## image を建てる

```sh
docker build --build-arg GIT_TAG=$(git describe --tags --abbrev=0) \
  --build-arg GIT_REV=$(git rev-parse --short HEAD) -t capture-player .
docker run --rm -p 8080:8080 -e S3_BUCKET_URL=http://store.example:8333/browserhive capture-player
```

`GIT_TAG` と `GIT_REV` は `/__version`・`/SOURCE.txt`・About に入り、About のソースのリンクはタグを指します。渡さないと、版は `unknown`、revision は `dev`、ソースのリンクは `main` になります。Web Capture では、[capture-ledger](https://github.com/uraitakahito/capture-ledger) の compose が submodule から image を建て、2 つを渡します。
