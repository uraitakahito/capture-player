# capture-player

The Web Capture viewer for BrowserHive WACZ files: WACZ files that conform to the
[BrowserHive WACZ Profile](https://uraitakahito.github.io/browserhive-specs/wacz-profile/1.25.0/).

capture-player is a **modified version** of
[ReplayWeb.page](https://github.com/webrecorder/replayweb.page) 2.5.0 and
[wabac.js](https://github.com/webrecorder/wabac.js) 2.27.1 by Webrecorder. It is
served the same way as
[replayweb-server](https://github.com/uraitakahito/replayweb-server), which serves
the unmodified ReplayWeb.page. Web Capture links to both: replayweb-server checks
that an archive replays in ReplayWeb.page as it is, and capture-player shows what a
BrowserHive WACZ adds on top of WACZ 1.1.1.

## What it changes

Everything that differs from upstream is listed in [NOTICE.md](NOTICE.md). In short:

- It checks DER (ASN.1) ECDSA signatures, as made by wacz-signer and authsign.
  Upstream passed them to WebCrypto as they were, so they never matched, and
  then counted the signature as verified anyway. capture-player counts a
  signature by whether it matched, and an unsigned archive as "not signed".
- In the page list, a BrowserHive snapshot shows its stage ("Snapshot after
  load") and the original document URL instead of its `urn:`.
- A document whose body the archive did not keep (`WARC-Truncated`) shows a
  notice with the reason instead of an empty page.
- Archive Info has a BrowserHive field: whether every body was kept, what was
  not, the document, snapshots, viewport, signature policy, the BrowserHive
  version and browser, a link to the BrowserHive WACZ Profile, and a notice
  that WebRTC traffic is not stopped.
- It never sends an archive URL to Webrecorder's helper proxy.
- About says it is a modified version, where its source is, and its license.
- It does **not** stop a replayed page from sending WebRTC (UDP) traffic. Pages
  replay with their own JavaScript running in the viewer's browser, and neither
  a Content-Security-Policy nor an injected script stops it (measured with
  Chrome for Testing 156 on 2026-11-11).

## Layout

| Path                                             | What                                                                                                                                                             |
| ------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `upstream/wabac.js/`, `upstream/replayweb.page/` | The two upstream repositories, imported with `git subtree --squash`, with capture-player's changes on top                                                        |
| `src/`                                           | The server, copied from replayweb-server: serves the viewer, proxies `/wacz/` out of an S3-compatible store, and answers page queries (`/q/`) for replay bundles |
| `scripts/build-viewer.sh`                        | Builds the viewer from `upstream/` on Node 24 into `public/`                                                                                                     |
| `scripts/check-upstream.mjs`                     | Fails when a file changed under `upstream/` is missing from `NOTICE.md`                                                                                          |

## Develop

```sh
pnpm install
NODENV_VERSION=24.15.0 pnpm run build:viewer   # Node 22–24: upstream's engines say node <25
pnpm run check                                 # Node 26
S3_BUCKET_URL=http://127.0.0.1:8333/browserhive node dist/main.js
```

Pull requests that run `git subtree pull` must be merged with a merge commit,
not squashed: the next pull finds the previous import by the
`git-subtree-dir:` / `git-subtree-split:` lines in its commit message. How to
follow a new upstream release is in [docs/upstream.md](docs/upstream.md).

## License

AGPL-3.0-or-later, the same as the two works it modifies. See [LICENSE](LICENSE).
What was modified, and when, is listed in [NOTICE.md](NOTICE.md).
