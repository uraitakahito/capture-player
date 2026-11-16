---
title: 上流から変えたこと
description: capture-player が ReplayWeb.page 2.5.0 と wabac.js 2.27.1 から変えた所の全部。
---

`upstream/` の下で変えたファイルは、変えた日と一緒に [NOTICE.md](https://github.com/uraitakahito/capture-player/blob/main/NOTICE.md) に載っています。この頁は、その直しが何をするかを書きます。

## 署名

capture-player は、[wacz-signer](https://github.com/uraitakahito/wacz-signer) や authsign が作る DER（Distinguished Encoding Rules、ASN.1 のバイナリの形）の ECDSA 署名を照合します。上流はこれを WebCrypto にそのまま渡していたので一度も合わず、それでも署名を「検証済み」と数えていました。capture-player は、合ったかどうかで署名を数え、署名の無いアーカイブは「not signed」と数えます。

## 頁の一覧の写し

頁の一覧で、BrowserHive の写しは `urn:` の代わりに、時点（「Snapshot after load」）と元の文書の URL を出します。

## 写しの中の枠

BrowserHive の写しは、枠を BrowserHive がその枠を撮った写しで開きます（[BrowserHive WARC Profile 1.5.0](https://uraitakahito.github.io/browserhive-warc-spec/1.5.0/#frame-snapshots)・[BrowserHive WACZ Profile 1.27.0](https://uraitakahito.github.io/browserhive-specs/wacz-profile/1.27.0/#snapshot-frames)）。写しの中の `<frame>`・`<iframe>` は、元の `src` を残し、子の写し（`urn:browserhive:frame-snapshot:`）を `data-browserhive-snapshot` で名指します。

改変していない ReplayWeb.page はこの属性を読まず、枠に記録した文書を出します。そのため枠には、写しを撮った時ではなく、読み込んだ時の頁が出ます。capture-player は枠を子の写しで開き、子の写しの中の枠も同じように開きます。記録した文書（写しでない物）の枠は、上流と同じに開きます。

合本では、写しは頁の一覧の行（WACZ を名指す）から開き、子の写しは同じ WACZ から読みます。

## スクリプトが足した要素

写しか、その枠の子の写しに、取り込みのスクリプトが足した要素（`data-capture-script`。[capture-scripts](https://github.com/uraitakahito/capture-scripts) のスクリプトが足した物に付ける属性）が在ると、再生の帯に「Script-added elements: N」と出ます。スクリプトごとの数は、hover と click で出ます。

## 頁の一覧の絵

頁の一覧に、BrowserHive の節目のスクリーンショットを出します。上流は `urn:thumbnail:<url>` だけを探しますが、BrowserHive WACZ にはそれが無いので、絵が出ませんでした。

- 文書の行には after-load のスクリーンショット（`urn:browserhive:screenshot:after-load:<url>`）、写しの行には同じ時点のスクリーンショットを出します。
- 無ければ、上流と同じに出します（`urn:thumbnail:`、次に favicon か「No image」）。
- 合本では、行には自分の WACZ のスクリーンショットだけを出し、同じ URL を別に撮った物は出しません。
- 読み込む前に遷移した頁の文書の行には、スクリーンショットを出しません（スクリーンショットは読み込んだ URL で名付くため）。

## アーカイブが残さなかった本文

アーカイブが本文を残さなかった文書（`WARC-Truncated`）は、空の頁の代わりに理由の知らせを出します。

## Archive Info

Archive Info に BrowserHive の欄があります。すべての本文を残したか、何を残さなかったか、文書、写し、viewport、署名の方針、BrowserHive の版とブラウザ、BrowserHive WACZ Profile へのリンク、WebRTC の通信は止めないという知らせです。

## 控えた乱数

撮った頁のスクリプトが受け取った乱数を BrowserHive WACZ が持つとき（`random/values.jsonl`、[BrowserHive WACZ Profile 1.26.0](https://uraitakahito.github.io/browserhive-specs/wacz-profile/1.26.0/#random-reading)）、再生した文書の中でスクリプトが `Math.random`・`crypto.getRandomValues`・`crypto.randomUUID` を呼ぶ n 回目には、そのスクリプトと関数について控えた n 番目の値を返します。乱数で見せる物を選ぶ頁は、撮った時に選んだ物を選べます。控えの無い呼び出しには、改変していない ReplayWeb.page と同じ値を返します。

値を使うのは、sha256 が `datapackage.json` と合うときだけです。`random/recorder.js` は走らせません。頁が控えの値を 1 つでも受け取ると、再生の帯に「Random: recorded values」と出て、hover で数が出ます。

これで再生が撮った時と同じになるわけではありません。ほかの呼び出しも、ほかの物も、再生の側から来ます。

## 撮った時の窓

capture-player は BrowserHive の頁を、撮った時の窓で出します。頁は、自分の居る窓で絵を選び（`srcset`・`<picture>`・CSS の `image-set()` と `resolution`）、スクリプトを走らせます（`devicePixelRatio`・`matchMedia`）。アーカイブが持つのは、撮ったブラウザがその窓で求めた物だけです（`datapackage.json` の `browserhive:capture.settings.viewport` と `devicePixelRatios`。BrowserHive の既定は 1280 × 800、DPR（device pixel ratio）1）。

capture-player は、再生の枠を撮った時の窓の大きさにし、枠の DPR が撮った時と同じになるよう CSS の `zoom` を置き、見る人の窓に収まるよう枠を縮め、頁のスクリプトには撮った時の `devicePixelRatio` を読ませます（上流は、アーカイブが言わないときはいつも 2 を返します）。枠の上の帯がそう知らせ、ボタンが 2 つあります。

- **Actual size** — 同じ枠を縮めずに出し、スクロールで見ます。
- **Use my window** — 上流と同じに、枠を窓いっぱいにします。頁は見る人の窓の版を求め、それはアーカイブに無いことがあります。スクリプトは撮った時の `devicePixelRatio` を読むままです。

窓を記録していないアーカイブは、上流と同じに再生します。

Chrome for Testing 156 で測りました。CSS の `zoom` で枠の DPR が変わることは、ほかのブラウザでは確かめていません。`zoom` が 1 より小さいとき（DPR 1 で撮った物を Retina の画面で見るとき）、マウスのホイールは見る人の窓よりも先まで頁をスクロールします。

## helper proxy に送らない

capture-player は、アーカイブの URL を Webrecorder の helper proxy に送りません。

## About

About は、改変した物であること、ソースの在処、ライセンスを言います。

## 変えていないこと: WebRTC

capture-player は、再生した頁が WebRTC（UDP）の通信を送るのを**止めません**。頁は見る人のブラウザで自分の JavaScript を走らせて再生され、Content-Security-Policy でも差し込んだスクリプトでも止まりません（2026-11-11 に Chrome for Testing 156 で測りました）。
