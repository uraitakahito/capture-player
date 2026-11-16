---
title: Running
description: The capture-player server — environment variables, ports, and what it serves.
---

capture-player runs as one Node process (`node dist/main.js`, the image's
entry point). It serves the viewer, proxies WACZ files out of an S3-compatible
store, and answers page queries for replay bundles. It fetches nothing from
anywhere else, and it sets no CORS headers.

## Environment variables

| Variable        | Default                                             | What                                                                                                     |
| --------------- | --------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| `S3_BUCKET_URL` | `http://seaweedfs.crawler-storage:8333/browserhive` | The bucket to read from, as `http(s)://<host>[:<port>]/<bucket>`. The bucket must allow anonymous reads. |
| `TLS_CERT`      | (none)                                              | A PEM certificate. With `TLS_KEY`, the server also listens on 443.                                       |
| `TLS_KEY`       | (none)                                              | The certificate's private key.                                                                           |

The default bucket is the store the Web Capture repositories share
([seaweedfs](https://github.com/uraitakahito/seaweedfs), project
`crawler-storage`). The stacks that run this image set `S3_BUCKET_URL`
themselves; the default is for running the image on its own.

The server refuses to start, with one `FATAL:` line on standard error, when:

- `S3_BUCKET_URL` is not `http(s)://<host>[:<port>]/<bucket>` (no host, no
  bucket, a user or password, a query, or a fragment):
  `FATAL: S3_BUCKET_URL must be http(s)://<host>[:<port>]/<bucket>, got: …`
- only one of `TLS_CERT` and `TLS_KEY` is set. Starting anyway would mean
  plaintext where encryption was meant.
- a certificate or key file cannot be read.

When `/etc/resolv.conf` has no `nameserver` line, the server starts anyway and
warns; only `/wacz/` and `/q/` fail, since they cannot reach the store. The
store's host name is resolved per request, so the store does not need to be up
when the server starts.

## Ports

- **8080** — plain HTTP/1.1, always.
- **443** — TLS with HTTP/2 and HTTP/1.1, only when `TLS_CERT` and `TLS_KEY`
  are set. 8080 stays open.

In the image, the server starts as root to open 443, then switches to the
`node` user. It handles `SIGTERM` and `SIGINT` itself (it runs as PID 1): it
waits a short while for requests in flight, then exits 0.

## What it serves

| Path                                   | What                                                                    |
| -------------------------------------- | ----------------------------------------------------------------------- |
| `/wacz/<key>`                          | The object `<S3_BUCKET_URL>/<key>` in the store                         |
| `/q/<location>/pages`                  | Page queries for a replay bundle, answered from its `pages.json`        |
| `/`, `/index.html`, `/ui.js`, `/sw.js` | The viewer                                                              |
| `/__version`                           | JSON with the capture-player tag and revision and the upstream versions |
| `/SOURCE.txt`                          | Where the source of this build is (AGPL-3.0 §13)                        |
| `/LICENSE`                             | The license, as text                                                    |

Anything else is 404. The full list of viewer files is in
[`src/static.ts`](https://github.com/uraitakahito/capture-player/blob/main/src/static.ts).

The replay bundle format, the page query, and how `/wacz/` keys are spelled are
defined by replayweb-player, which this server was copied from:
[`docs/replay-bundle.md`](https://github.com/uraitakahito/replayweb-player/blob/main/docs/replay-bundle.md)
in [replayweb-player](https://github.com/uraitakahito/replayweb-player).

## Building the image

```sh
docker build --build-arg GIT_TAG=$(git describe --tags --abbrev=0) \
  --build-arg GIT_REV=$(git rev-parse --short HEAD) -t capture-player .
docker run --rm -p 8080:8080 -e S3_BUCKET_URL=http://store.example:8333/browserhive capture-player
```

`GIT_TAG` and `GIT_REV` go into `/__version`, `/SOURCE.txt` and About; About's
source link points at the tag. Without them, the version is `unknown`, the
revision `dev`, and the source link points at `main`. In Web
Capture, the compose file of
[capture-ledger](https://github.com/uraitakahito/capture-ledger) builds the
image from its submodule and passes both.
