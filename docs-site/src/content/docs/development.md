---
title: Development
description: The layout of the capture-player repository, building the viewer, and the checks.
---

## Layout

| Path                                             | What                                                                                                                                                                                                                 |
| ------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `upstream/wabac.js/`, `upstream/replayweb.page/` | The two upstream repositories, imported with `git subtree --squash`, with capture-player's changes on top                                                                                                            |
| `src/`                                           | The server, copied from [replayweb-server](https://github.com/uraitakahito/replayweb-server): serves the viewer, proxies `/wacz/` out of an S3-compatible store, and answers page queries (`/q/`) for replay bundles |
| `scripts/build-viewer.sh`                        | Builds the viewer from `upstream/` on Node 24 into `public/`                                                                                                                                                         |
| `scripts/test-viewer.sh`                         | Runs the tests capture-player added under `upstream/wabac.js/test/`                                                                                                                                                  |
| `scripts/check-upstream.mjs`                     | Fails when a file changed under `upstream/` is missing from `NOTICE.md`                                                                                                                                              |
| `test/`                                          | The server's tests (vitest), against a stand-in store                                                                                                                                                                |
| `test-e2e/`                                      | The built viewer in headless Chrome, with BrowserHive WACZ files in `test-e2e/fixtures/`                                                                                                                             |
| `docs-site/`                                     | This site (Astro and Starlight)                                                                                                                                                                                      |

## Two Node versions

The server and the checks run on Node 26 (`.nvmrc`). The viewer builds on
Node 22–24, because upstream ReplayWeb.page's `engines` say `node <25`; each
upstream repository installs with its own yarn and lockfile, outside the pnpm
workspace.

```sh
pnpm install
NODENV_VERSION=24.15.0 pnpm run build:viewer   # the viewer, into public/
NODENV_VERSION=24.15.0 pnpm run test:viewer    # the tests capture-player added under upstream/
pnpm run check                                 # the server's checks (Node 26)
S3_BUCKET_URL=http://127.0.0.1:8333/browserhive node dist/main.js
```

`pnpm run check` runs, in order, what the `check` script in
[`package.json`](https://github.com/uraitakahito/capture-player/blob/main/package.json)
lists. It does not build the viewer.

## Browser tests

`pnpm run test:e2e` opens the built viewer (`public/`, from
`pnpm run build:viewer`) in headless Chrome. It uses `CHROME_PATH`, or else
Chrome for Testing 156 from the puppeteer cache (`~/.cache/puppeteer`). The
server and the tests run on Node 26.

## This site

```sh
pnpm run site:dev       # live preview
pnpm run site:check     # build, then check links and the en/ja pairs
```

Both serve under the base path: open `http://localhost:4321/capture-player/`.
Write links between pages as relative links (`../running/`); a link that starts
with `/` loses the base path. A page in English needs a page with the same file
name under `ja/`, and the other way round. `site:check` fails otherwise.

## CI

[`ci.yml`](https://github.com/uraitakahito/capture-player/blob/main/.github/workflows/ci.yml)
runs the server's checks, builds and tests the viewer, and builds the image and
probes a running container. `site.yml` runs `site:check`. `docs.yml` publishes
this site when a `v*` tag is pushed.

## Merging an upstream pull

Pull requests that run `git subtree pull` must be merged with a merge commit,
not squashed: the next pull finds the previous import by the
`git-subtree-dir:` / `git-subtree-split:` lines in its commit message. The steps
are in [Following upstream](../upstream/).

## Releases

A release is an annotated tag `vX.Y.Z` on a commit on `main`. `package.json`'s
`version` stays at `0.0.1`. Pushing the tag publishes this site.
