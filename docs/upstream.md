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
