---
title: Following upstream
description: Taking a new ReplayWeb.page or wabac.js release into upstream/.
---

capture-player imports Webrecorder's [wabac.js](https://github.com/webrecorder/wabac.js)
and [replayweb.page](https://github.com/webrecorder/replayweb.page) under
`upstream/` with `git subtree --squash`, and changes them. The files it changed
are listed in [NOTICE.md](https://github.com/uraitakahito/capture-player/blob/main/NOTICE.md).

## Current versions

| Upstream       | Version                                                        | Path                       |
| -------------- | -------------------------------------------------------------- | -------------------------- |
| replayweb.page | v2.5.0                                                         | `upstream/replayweb.page/` |
| wabac.js       | v2.27.1 (the version replayweb.page v2.5.0's `yarn.lock` pins) | `upstream/wabac.js/`       |

These are the same versions as in
[replayweb-server](https://github.com/uraitakahito/replayweb-server), which
serves the unmodified ReplayWeb.page as the compatibility replay. That way, a
difference between the two links comes only from capture-player's changes, not
from an upstream version difference.

Some of capture-player's changes change what a page looks like:

- When a BrowserHive WACZ holds the recorded random values
  (`random/values.jsonl`), capture-player gives the page's scripts the recorded
  values. A page that picks what to show at random may pick something else in
  replayweb-server, and what it picked at capture in capture-player.
- capture-player opens a BrowserHive WACZ page in the window it was captured in
  (`viewport` and `devicePixelRatios` in `browserhive:capture.settings` in
  `datapackage.json`). A page that picks image variants by the window's width,
  height, or DPR (device pixel ratio) asks, in replayweb-server, for the
  viewer's variants, which the archive may not hold; in capture-player it asks
  for the captured ones.
- The page list's images differ. Upstream's list looks images up only by the
  name `urn:thumbnail:<page URL>`, but a BrowserHive WACZ holds stage
  screenshots (`urn:browserhive:screenshot:<stage>:<document URL>`). The list
  in replayweb-server (port 8899 in the local dev stack) shows no image;
  capture-player (port 8897) shows the after-load screenshot on a document's row
  and the screenshot of the same stage on a snapshot's row.
- Frames in a snapshot differ. In a snapshot (`urn:browserhive:snapshot:`) from
  BrowserHive v31.2.0 on, a `<frame>` or `<iframe>` keeps its original `src` and
  holds the URI of its child frame's snapshot
  (`urn:browserhive:frame-snapshot:`) in `data-browserhive-snapshot`
  ([BrowserHive WARC Profile 1.5.0](https://uraitakahito.github.io/browserhive-warc-spec/1.5.0/#frame-snapshot-references)).
  replayweb-server does not read the attribute and shows the recorded document
  (as it loaded) in the frame. capture-player opens the frame on the child
  snapshot, so what a script added inside the frame appears only in
  capture-player. When a snapshot holds elements a script added
  (`data-capture-script`), capture-player's replay bar says
  "Script-added elements: N".

## Upstream's `static/wombat*.js` is not served

`upstream/wabac.js/static/wombat.js` and `wombatWorkers.js` are prebuilt copies
kept in the upstream wabac.js repository (an old version that fixes
`window.devicePixelRatio` at 1). capture-player's build does not use them. The
wombat served to replayed pages is built by the `wombat` entry of
`upstream/wabac.js/webpack.config.cjs` from `@webrecorder/wombat` on npm
(3.10.7 now) and bundled into `sw.js` (it sets `devicePixelRatio` from
`wbinfo.pixel_ratio`). `scripts/build-viewer.sh` serves only `index.html`,
`ui.js` and `sw.js`. The copies are left in place so that they need not be
deleted again on every upstream pull.

## When a new version is out

`.github/workflows/upstream.yml` compares with the latest on npm once a week and
opens an issue when there is a newer version.

1. Make a worktree (do not work in the main checkout).
   ```sh
   git -C ~/projects/web-capture/capture-player fetch origin
   git -C ~/projects/web-capture/capture-player worktree add ~/projects/web-capture/tmp/cp-upstream -b chore/upstream-<version> origin/main
   ```
2. Find the wabac version that replayweb.page's `yarn.lock` pins in that version
   (`@webrecorder/wabac@npm:` in `git show v<version>:yarn.lock`).
3. Pull both. On conflicts, put the changes back on top.
   ```sh
   git subtree pull --prefix upstream/wabac.js https://github.com/webrecorder/wabac.js v<wabac version> --squash
   git subtree pull --prefix upstream/replayweb.page https://github.com/webrecorder/replayweb.page v<version> --squash
   ```
4. Check that `resolutions` (`portal:../wabac.js`) is still in
   `upstream/replayweb.page/package.json`, run `corepack yarn install` on
   Node 24, and move `yarn.lock` forward.
5. Compare a build without capture-player's changes byte for byte with
   `index.html`, `ui.js` and `sw.js` of that version on npm (they were the same
   for v2.5.0 on 2026-11-12).
6. Run `pnpm run check` (it includes `check:upstream`) and the viewer build
   (`NODENV_VERSION=24.15.0 pnpm run build:viewer`). For vulnerabilities in
   upstream's dependencies, run `corepack yarn npm audit` in `upstream/*/`
   (they do not show in `pnpm audit`).
7. Update the versions in `NOTICE.md` and on this page
   (`docs-site/src/content/docs/upstream.md` and `ja/upstream.md`).
8. **Merge the pull request with a merge commit (do not squash).**
   `git subtree pull` looks for the `git-subtree-dir:` and
   `git-subtree-split:` lines of the previous import's commit message in the
   history. Squashing removes them from `main`.
9. After the release (minor), move capture-ledger's `.upstream/capture-player`
   forward.

## Sending a change upstream

The DER signatures that do not verify would help upstream too (replayweb.page
issue #520 is a close symptom). Upstream's README asks for an issue before a
pull request. Sending one is an outward action, so the maintainer decides.
