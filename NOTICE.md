# Notices

capture-player contains modified versions of two works by Webrecorder.

| Work           | Version | Source                                                      | Copyright                               | License           |
| -------------- | ------- | ----------------------------------------------------------- | --------------------------------------- | ----------------- |
| ReplayWeb.page | 2.5.0   | <https://github.com/webrecorder/replayweb.page/tree/v2.5.0> | Copyright (C) 2020 Webrecorder Software | AGPL-3.0-or-later |
| wabac.js       | 2.27.1  | <https://github.com/webrecorder/wabac.js/tree/v2.27.1>      | Copyright (C) 2020 Webrecorder Software | AGPL-3.0-or-later |

They are imported under `upstream/` with `git subtree`. capture-player as a whole
is released under the GNU Affero General Public License, version 3 or (at your
option) any later version. See [LICENSE](LICENSE). There is NO WARRANTY, to the
extent permitted by law.

## Modifications

Every file under `upstream/` that capture-player changed is listed here, with the
date of the change. Files that can hold a comment carry one starting with
`capture-player:` where they were changed. `pnpm run check:upstream` fails when a changed file is missing from this list.

| Date       | File                                                                 | Change                                                                                                                                                                                                         |
| ---------- | -------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2026-11-12 | `upstream/wabac.js/src/blockloaders.ts`                              | Never send an archive URL to Webrecorder's helper proxy (`helper-proxy.webrecorder.workers.dev`).                                                                                                              |
| 2026-11-12 | `upstream/replayweb.page/package.json`                               | Resolve `@webrecorder/wabac` to `upstream/wabac.js` (`resolutions` with `portal:`).                                                                                                                            |
| 2026-11-12 | `upstream/replayweb.page/yarn.lock`                                  | Updated for the `resolutions` above.                                                                                                                                                                           |
| 2026-11-12 | `upstream/replayweb.page/webpack.capture-player.cjs`                 | New. Build only the browser bundle (`ui.js`, `sw.js`); empty the helper proxy; put the capture-player version and source URL into About.                                                                       |
| 2026-11-12 | `upstream/replayweb.page/index.html`                                 | Name the page capture-player.                                                                                                                                                                                  |
| 2026-11-12 | `upstream/replayweb.page/src/appmain.ts`                             | Name the app capture-player, show it as text instead of the ReplayWeb.page logo, and state in About that this is a modified version, where its source is, its license, and that WebRTC traffic is not stopped. |
| 2026-11-12 | `upstream/replayweb.page/src/embed.ts`                               | Name the app capture-player.                                                                                                                                                                                   |
| 2026-11-12 | `upstream/replayweb.page/src/item.ts`                                | Name the app capture-player.                                                                                                                                                                                   |
| 2026-11-12 | `upstream/replayweb.page/src/swmanager.ts`                           | Name the app capture-player.                                                                                                                                                                                   |
| 2026-11-12 | `upstream/replayweb.page/src/globals.d.ts`                           | Declare the two build-time constants for About.                                                                                                                                                                |
| 2026-11-12 | `upstream/wabac.js/src/wacz/certutils.ts`                            | Convert a DER (ASN.1) ECDSA signature to r‖s before WebCrypto checks it. Upstream passed DER as is, so every DER signature failed.                                                                             |
| 2026-11-12 | `upstream/wabac.js/src/wacz/multiwacz.ts`                            | Count the signature as valid only when it matched. Upstream counted it as valid whether or not it matched.                                                                                                     |
| 2026-11-12 | `upstream/wabac.js/test/capturePlayerSignature.ts`                   | New. Tests for the two changes above.                                                                                                                                                                          |
| 2026-11-12 | `upstream/wabac.js/test/data/capture-player/README.md`               | New. Where the test signatures come from.                                                                                                                                                                      |
| 2026-11-12 | `upstream/wabac.js/test/data/capture-player/signature-der.json`      | New. Test signature (DER).                                                                                                                                                                                     |
| 2026-11-12 | `upstream/wabac.js/test/data/capture-player/signature-tampered.json` | New. Test signature (DER, one bit flipped).                                                                                                                                                                    |
| 2026-11-12 | `upstream/wabac.js/test/data/capture-player/signature-raw.json`      | New. Test signature (r‖s).                                                                                                                                                                                     |
| 2026-11-12 | `upstream/replayweb.page/src/pageentry.ts`                           | In the page list, a BrowserHive snapshot (`urn:browserhive:snapshot:<stage>:<url>`) shows its stage in the title and the original document URL instead of the URN.                                             |
| 2026-11-12 | `upstream/wabac.js/src/warcloader.ts`                                | Pass a record's `WARC-Truncated` on as the response header `x-capture-player-truncated`. Upstream did not read it.                                                                                             |
| 2026-11-12 | `upstream/wabac.js/src/collection.ts`                                | When a document's body was not kept (`WARC-Truncated`), show a notice that says so and why, marked as shown by capture-player, instead of an empty page.                                                       |
