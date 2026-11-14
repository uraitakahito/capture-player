# 上流への追随

capture-player は、Webrecorder の [wabac.js](https://github.com/webrecorder/wabac.js) と
[replayweb.page](https://github.com/webrecorder/replayweb.page) を `upstream/` の下に `git subtree --squash` で
取り込み、直した物です。直したファイルの一覧は [NOTICE.md](../NOTICE.md) にあります。

## いまの版

| 上流           | 版                                                           | 置き場                     |
| -------------- | ------------------------------------------------------------ | -------------------------- |
| replayweb.page | v2.5.0                                                       | `upstream/replayweb.page/` |
| wabac.js       | v2.27.1（replayweb.page v2.5.0 の `yarn.lock` が固定する版） | `upstream/wabac.js/`       |

replayweb-server（改変していない ReplayWeb.page を配る、互換の再生）と同じ版にしてあります。
2 つのリンクの見え方の差が、上流の版の差ではなく capture-player の直しだけになるようにするためです。

capture-player の直しには、見え方を変える物があります。BrowserHive WACZ が乱数の控え（`random/values.jsonl`）を
持つとき、capture-player は頁のスクリプトに控えの値を返します（CAPTURE-378）。乱数で見せる物を選ぶ頁は、
replayweb-server では撮った時と違う物を選び直し、capture-player では撮った時に選んだ物を選ぶことがあります。
2 つのリンクで頁が違って見えるのは、この直しのためで、版の差ではありません。

もう 1 つ、capture-player は BrowserHive WACZ の頁を、撮った時の窓（`datapackage.json` の `browserhive:capture.settings` の
`viewport` と `devicePixelRatios`）で開きます（CAPTURE-422）。窓の幅・高さ・DPR で絵の版を選ぶ頁は、replayweb-server では
見る人の窓の版を求めて記録に無いことがあり、capture-player では撮った時の版を求めます。

頁の一覧の絵も違います（CAPTURE-440）。上流の一覧は絵を `urn:thumbnail:<頁の URL>` の名前だけで引きますが、BrowserHive WACZ に
在るのは節目のスクリーンショット（`urn:browserhive:screenshot:<時点>:<文書の URL>`）です。replayweb-server（手元の dev の一式では
8899 番）の一覧には絵が出ず、capture-player（8897 番）では文書の行に after-load の絵、写しの行に同じ時点の絵が出ます。

写しの枠も違います（CAPTURE-147）。BrowserHive v31.2.0 からの写し（`urn:browserhive:snapshot:`）の中の `<frame>`・`<iframe>` は、
`src` を元のまま残し、子フレームの写しの URI（`urn:browserhive:frame-snapshot:`）を `data-browserhive-snapshot` に持ちます
（[BrowserHive WARC Profile 1.5.0](https://uraitakahito.github.io/browserhive-warc-spec/1.5.0/#frame-snapshot-references)）。
replayweb-server は属性を読まず、枠に記録した元の文書（読み込んだ時の物）を出します。capture-player は枠を子の写しで開くので、
スクリプトが枠の中に足した物は capture-player にだけ出ます。写しにスクリプトが足した要素（`data-capture-script`）が在れば、
capture-player の再生の帯に「Script-added elements: N」と出ます。

## 上流の `static/wombat*.js` は配っていない

`upstream/wabac.js/static/wombat.js` と `wombatWorkers.js` は、上流の wabac.js の repo に在る、前に build した写しです
（`window.devicePixelRatio` を 1 に固定する古い版）。capture-player の build はこれを使いません。再生の頁に配る wombat は、
`upstream/wabac.js/webpack.config.cjs` の `wombat` の組が npm の `@webrecorder/wombat`（いまは 3.10.7）から作り、
`sw.js` に束ねます（`wbinfo.pixel_ratio` を `devicePixelRatio` に置く）。`scripts/build-viewer.sh` が配るのは
`index.html`・`ui.js`・`sw.js` だけです。上流への追随のたびに消し直さなくて済むよう、写しは消さずに置いています（CAPTURE-421）。

## 新しい版が出たら

`.github/workflows/upstream.yml` が週に 1 回 npm の最新と比べ、新しければ issue を開きます。

1. worktree を切る（本体の checkout では作業しない）。
   ```sh
   git -C ~/projects/web-capture/capture-player fetch origin
   git -C ~/projects/web-capture/capture-player worktree add ~/projects/web-capture/tmp/cp-upstream -b chore/upstream-<版> origin/main
   ```
2. replayweb.page のその版の `yarn.lock` が固定する wabac の版を見る（`git show v<版>:yarn.lock` の `@webrecorder/wabac@npm:`）。
3. 2 つを取り込む。ぶつかったら、直しを載せ直す。
   ```sh
   git subtree pull --prefix upstream/wabac.js https://github.com/webrecorder/wabac.js v<wabac の版> --squash
   git subtree pull --prefix upstream/replayweb.page https://github.com/webrecorder/replayweb.page v<版> --squash
   ```
4. `upstream/replayweb.page/package.json` の `resolutions`（`portal:../wabac.js`）が残っているかを見て、
   Node 24 で `corepack yarn install` を流し、`yarn.lock` を進める。
5. 直しを外した build が、npm のその版の `index.html`・`ui.js`・`sw.js` とバイトまで同じかを比べる
   （2026-11-12 の v2.5.0 では同じだった）。
6. `pnpm run check`（`check:upstream` を含む）と、ビューアの build（`NODENV_VERSION=24.15.0 pnpm run build:viewer`）。
   上流の依存の脆弱性は、`upstream/*/` で `corepack yarn npm audit` を見る（pnpm audit には出ない）。
7. `NOTICE.md` と `docs/upstream.md` の版を直す。
8. **PR は merge commit で入れる（squash しない）。** `git subtree pull` は、前の取り込みの commit の文の
   `git-subtree-dir:`・`git-subtree-split:` を履歴から探す。squash すると、その文が main から消える。
9. リリース（minor）の後、capture-ledger の `.upstream/capture-player` を上げる。

## 直しを上流へ返すなら

DER の署名を照合できない件は、上流でも役に立ちます（replayweb.page の issue #520 が近い症状）。上流の README は、
PR の前に issue を立てるよう頼んでいます。外へ出す操作なので、出すかは利用者が決めます。
