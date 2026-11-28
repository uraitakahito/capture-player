---
title: capture-player
description: The Web Capture viewer for BrowserHive WACZ files — a modified ReplayWeb.page and wabac.js.
---

capture-player is the Web Capture viewer for BrowserHive WACZ (Web Archive
Collection Zipped) files: WACZ files that conform to the
[BrowserHive WACZ Profile](https://uraitakahito.github.io/browserhive-specs/wacz-profile/1.28.0/).

It is a **modified version** of
[ReplayWeb.page](https://github.com/webrecorder/replayweb.page) 2.5.0 and
[wabac.js](https://github.com/webrecorder/wabac.js) 2.27.1 by Webrecorder,
served by a small Node server.

## Two viewers

Web Capture links to two viewers for every archive:

- [replayweb-player](https://github.com/uraitakahito/replayweb-player) serves
  the **unmodified** ReplayWeb.page. It checks that an archive replays in
  ReplayWeb.page as it is.
- capture-player serves the modified one. It shows what a BrowserHive WACZ adds
  on top of WACZ 1.1.1: snapshots, stage screenshots, the window the page was
  captured in, recorded random values, and a field in Archive Info.

Both are served the same way: capture-player's server was copied from
replayweb-player. Both use the same upstream versions, so a difference between
the two links comes from capture-player's changes, not from a version
difference.

## Where to go next

- [What it changes](what-it-changes/) — every way capture-player differs from upstream.
- [Running](running/) — the server: environment variables, ports, and what it serves.
- [Development](development/) — the layout of the repository, building the viewer, and the checks.
- [Following upstream](upstream/) — taking a new ReplayWeb.page or wabac.js release.

## License

AGPL-3.0-or-later, the same as the two works it modifies. See
[LICENSE](https://github.com/uraitakahito/capture-player/blob/main/LICENSE).
Every file changed under `upstream/`, and when, is listed in
[NOTICE.md](https://github.com/uraitakahito/capture-player/blob/main/NOTICE.md).
