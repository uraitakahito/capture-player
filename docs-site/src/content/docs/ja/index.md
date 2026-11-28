---
title: capture-player
description: BrowserHive WACZ を再生する Web Capture のビューア。ReplayWeb.page と wabac.js を改変した物です。
---

capture-player は、BrowserHive WACZ（Web Archive Collection Zipped）を再生する Web Capture のビューアです。BrowserHive WACZ は、[BrowserHive WACZ Profile](https://uraitakahito.github.io/browserhive-specs/wacz-profile/1.28.0/) に沿った WACZ です。

Webrecorder の [ReplayWeb.page](https://github.com/webrecorder/replayweb.page) 2.5.0 と [wabac.js](https://github.com/webrecorder/wabac.js) 2.27.1 を**改変した物**で、小さな Node の server が配ります。

## 2 つのビューア

Web Capture は、どのアーカイブにも 2 つのビューアへのリンクを出します。

- [replayweb-player](https://github.com/uraitakahito/replayweb-player) は、**改変していない** ReplayWeb.page を配ります。アーカイブが ReplayWeb.page でそのまま再生できるかを見るための物です。
- capture-player は、改変した物を配ります。BrowserHive WACZ が WACZ 1.1.1 に足した物（写し、節目のスクリーンショット、撮った時の窓、控えた乱数、Archive Info の欄）を見せます。

配り方は同じです。capture-player の server は replayweb-player から写しました。上流の版も同じにしてあるので、2 つのリンクの見え方の差は capture-player の直しから来ていて、版の差ではありません。

## 次に読む頁

- [1 回の取り込みの頁](pages/) — 1 回の取り込みが頁の一覧に 2 つか 3 つ並ぶ訳と、どれを見ればよいか。
- [上流から変えたこと](what-it-changes/) — capture-player が上流と違う所の全部。
- [動かす](running/) — server の環境変数・port・配る物。
- [開発](development/) — repo の置き場、ビューアの build、検査。
- [上流への追随](upstream/) — ReplayWeb.page や wabac.js の新しい版を取り込む手順。

## ライセンス

改変した 2 つと同じ AGPL-3.0-or-later です。[LICENSE](https://github.com/uraitakahito/capture-player/blob/main/LICENSE) を見てください。`upstream/` の下で変えたファイルと変えた日は、[NOTICE.md](https://github.com/uraitakahito/capture-player/blob/main/NOTICE.md) に載っています。
