---
title: What it changes
description: Every way capture-player differs from ReplayWeb.page 2.5.0 and wabac.js 2.27.1.
---

Every file changed under `upstream/` is listed, with the date, in
[NOTICE.md](https://github.com/uraitakahito/capture-player/blob/main/NOTICE.md).
This page says what those changes do.

## Signatures

capture-player checks DER (Distinguished Encoding Rules, the ASN.1 binary form)
ECDSA signatures, as made by
[wacz-signer](https://github.com/uraitakahito/wacz-signer) and authsign.
Upstream passed them to WebCrypto as they were, so they never matched, and then
counted the signature as verified anyway. capture-player counts a signature by
whether it matched, and an unsigned archive as "not signed".

## Snapshots in the page list

In the page list, a BrowserHive snapshot shows its stage ("Snapshot after
load") and the original document URL instead of its `urn:`.

## Frames in a snapshot

A BrowserHive snapshot opens its frames on the snapshots BrowserHive took of
them ([BrowserHive WARC Profile 1.5.0](https://uraitakahito.github.io/browserhive-warc-spec/1.5.0/#frame-snapshots),
[BrowserHive WACZ Profile 1.27.0](https://uraitakahito.github.io/browserhive-specs/wacz-profile/1.27.0/#snapshot-frames)).
In a snapshot, a `<frame>` or `<iframe>` keeps its original `src` and names its
child snapshot (`urn:browserhive:frame-snapshot:`) in `data-browserhive-snapshot`.

Unmodified ReplayWeb.page does not read the attribute and shows the recorded
document in the frame, so the frame shows the page as it loaded, not as it was
when the snapshot was taken. capture-player opens the frame on the child
snapshot, and so on for frames inside a child snapshot. A recorded document
(not a snapshot) opens its frames as upstream does.

In a replay bundle, a snapshot opens from its row in the page list, which names
its WACZ, and its child snapshots are read from the same WACZ.

## Elements a capture script added

When a snapshot, or a child snapshot in one of its frames, holds elements a
capture script added (`data-capture-script`, the attribute the scripts in
[capture-scripts](https://github.com/uraitakahito/capture-scripts) put on what
they add), the replay bar says "Script-added elements: N", with the count per
script on hover and click.

## Screenshots in the page list

The page list shows BrowserHive's stage screenshots. Upstream only looks for
`urn:thumbnail:<url>`, which a BrowserHive WACZ does not have, so it showed no
image.

- A document row shows the after-load screenshot
  (`urn:browserhive:screenshot:after-load:<url>`), and a snapshot row the
  screenshot of the same stage.
- Without one, a row is shown as upstream shows it (`urn:thumbnail:`, then the
  favicon or "No image").
- In a replay bundle, a row shows only a screenshot from its own WACZ, never one
  from another capture of the same URL.
- A document whose page redirected before it loaded gets no screenshot in its
  row (the screenshot is named by the URL it loaded).

## Bodies the archive did not keep

A document whose body the archive did not keep (`WARC-Truncated`) shows a notice
with the reason instead of an empty page.

## Archive Info

Archive Info has a BrowserHive field: whether every body was kept, what was not,
the document, snapshots, viewport, signature policy, the BrowserHive version and
browser, a link to the BrowserHive WACZ Profile, and a notice that WebRTC
traffic is not stopped.

## Recorded random values

When a BrowserHive WACZ holds the random values the captured page's scripts
received (`random/values.jsonl`,
[BrowserHive WACZ Profile 1.26.0](https://uraitakahito.github.io/browserhive-specs/wacz-profile/1.26.0/#random-reading)),
the n-th call a script makes to `Math.random`, `crypto.getRandomValues` or
`crypto.randomUUID` in a replayed document gets the n-th value recorded for that
script and function. A page that picks what to show at random can then pick
what it picked at capture. A call with no recorded value gets the value
unmodified ReplayWeb.page would give it.

The values are used only when their sha256 matches `datapackage.json`;
`random/recorder.js` is never run. The replay bar says "Random: recorded
values" when the page received at least one recorded value, with the counts on
hover.

This does not make the replay the same as the capture: other calls, and
everything else, still come from the replay.

## The window the page was captured in

capture-player shows a BrowserHive page in the window it was captured in. A
page picks images (`srcset`, `<picture>`, CSS `image-set()` and `resolution`)
and runs script (`devicePixelRatio`, `matchMedia`) by the window it is in, and
the archive only holds what the capturing browser asked for in its window
(`browserhive:capture.settings.viewport` and `devicePixelRatios` in
`datapackage.json`; BrowserHive's default is 1280 × 800 at a device pixel ratio
(DPR) of 1).

capture-player sizes the replay frame to that window, sets CSS `zoom` so the
frame's DPR is the captured one, scales the frame to fit the viewer's window,
and has the page's script read the captured `devicePixelRatio` (upstream always
gives it 2 when the archive does not say). A bar above the frame says so, with
two buttons:

- **Actual size** — the same frame, unscaled, scrolled.
- **Use my window** — the frame fills the window, as upstream. The page then
  asks for the viewer's variants, which the archive may not hold; script still
  reads the captured `devicePixelRatio`.

An archive that does not record the window replays as upstream does.

Measured with Chrome for Testing 156; CSS `zoom` changing a frame's DPR is not
checked in other browsers. With `zoom` below 1 (a capture at DPR 1 on a Retina
screen), the mouse wheel scrolls the page further than in the viewer's window.

## No helper proxy

capture-player never sends an archive URL to Webrecorder's helper proxy.

## About

About says it is a modified version, where its source is, and its license.

## What it does not change: WebRTC

capture-player does **not** stop a replayed page from sending WebRTC (UDP)
traffic. Pages replay with their own JavaScript running in the viewer's browser,
and neither a Content-Security-Policy nor an injected script stops it (measured
with Chrome for Testing 156 on 2026-11-11).
