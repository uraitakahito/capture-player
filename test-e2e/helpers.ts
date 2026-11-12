import { createServer, type Server } from "node:http";
import { createReadStream, existsSync, readdirSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import type { AddressInfo } from "node:net";
import puppeteer, { type Browser, type Page } from "puppeteer-core";

import { run, type RunningViewer } from "../src/run.js";

export const ROOT = resolve(import.meta.dirname, "..");
const FIXTURES = join(ROOT, "test-e2e", "fixtures");

const CHROME_VERSION = "156.0.8078.47";

/** CHROME_PATH か、puppeteer の置き場の Chrome for Testing（版を固定） */
export const chromePath = (): string => {
  const fromEnv = process.env["CHROME_PATH"];
  if (fromEnv) return fromEnv;
  const base = join(homedir(), ".cache", "puppeteer", "chrome");
  const dir = existsSync(base)
    ? readdirSync(base).find((d) => d.endsWith(CHROME_VERSION))
    : undefined;
  if (dir === undefined)
    throw new Error(`Chrome for Testing ${CHROME_VERSION} が無い。CHROME_PATH を渡す`);
  const mac = join(
    base,
    dir,
    "chrome-mac-arm64",
    "Google Chrome for Testing.app",
    "Contents",
    "MacOS",
    "Google Chrome for Testing",
  );
  return existsSync(mac) ? mac : join(base, dir, "chrome-linux64", "chrome");
};

/**
 * build したビューア（public/）を配る capture-player の server。既定では保管庫を使わない（WACZ は別の配信から
 * 読む）。`bucket` を渡すと、それを保管庫として `/wacz/` と `/q/` を通す（合本を試すとき。見本の配信の
 * `/bucket` を渡す）。
 */
export const startViewer = async (
  bucket = "http://127.0.0.1:9/unused",
): Promise<{ viewer: RunningViewer; origin: string }> => {
  if (!existsSync(join(ROOT, "public", "sw.js")))
    throw new Error("public/ が無い。先に pnpm run build:viewer");
  const viewer = await run(
    {
      env: { S3_BUCKET_URL: bucket },
      stdout: { write: () => true },
      stderr: { write: (t: string) => process.stderr.write(t) },
      // shutdown は exit(0) を呼ぶ。0 以外は起動の失敗
      exit: (code: number) => {
        if (code !== 0) throw new Error(`viewer exited ${String(code)}`);
      },
      on: () => undefined,
    },
    {
      host: "127.0.0.1",
      plainPort: 0,
      securePort: 0,
      staticDir: join(ROOT, "public"),
      resolvConfPath: "/etc/resolv.conf",
    },
  );
  if (viewer === undefined) throw new Error("viewer did not start");
  return { viewer, origin: `http://127.0.0.1:${String(viewer.addresses.plain.port)}` };
};

/**
 * test-e2e/fixtures を CORS と Range つきで配る（ビューアは別の origin の WACZ を ?source= で読む）。
 * `bucket/` の下は、保管庫の代わりに鍵の path のまま配る（合本の WACZ・replay.json・pages.json）。
 */
export const startFixtures = async (): Promise<{ server: Server; base: string }> => {
  const server = createServer((req, res) => {
    const headers: Record<string, string> = {
      "access-control-allow-origin": "*",
      "access-control-allow-headers": "range",
      "access-control-expose-headers": "content-length, content-range, accept-ranges",
      "accept-ranges": "bytes",
    };
    if (req.method === "OPTIONS") {
      res.writeHead(204, headers).end();
      return;
    }
    const name = new URL(req.url ?? "/", "http://x").pathname.slice(1);
    const file = join(FIXTURES, name);
    const inBucket =
      /^bucket\/[A-Za-z0-9_.-]+(\/[A-Za-z0-9_.-]+)*$/.test(name) && !name.includes("..");
    if (
      (!/^[a-z-]+\.wacz$/.test(name) && !inBucket) ||
      !existsSync(file) ||
      !statSync(file).isFile()
    ) {
      res.writeHead(404, headers).end();
      return;
    }
    const size = statSync(file).size;
    const m = /bytes=(\d+)-(\d*)/.exec(req.headers.range ?? "");
    if (m) {
      const start = Number(m[1]);
      const end = m[2] ? Number(m[2]) : size - 1;
      res.writeHead(206, {
        ...headers,
        "content-range": `bytes ${String(start)}-${String(end)}/${String(size)}`,
        "content-length": String(end - start + 1),
      });
      if (req.method === "HEAD") res.end();
      else createReadStream(file, { start, end }).pipe(res);
      return;
    }
    const type = name.endsWith(".json") ? { "content-type": "application/json" } : {};
    res.writeHead(200, { ...headers, ...type, "content-length": String(size) });
    if (req.method === "HEAD") res.end();
    else createReadStream(file).pipe(res);
  });
  await new Promise<void>((ok) => server.listen(0, "127.0.0.1", ok));
  return { server, base: `http://127.0.0.1:${String((server.address() as AddressInfo).port)}` };
};

export const launch = (): Promise<Browser> =>
  puppeteer.launch({
    executablePath: chromePath(),
    headless: true,
    args: ["--use-mock-keychain", "--disable-features=LocalNetworkAccessChecks", "--no-sandbox"],
  });

/** ビューアの UI の shadow DOM を全部たどった文字 */
export const deepText = (page: Page): Promise<string> =>
  page.evaluate(() => {
    const parts: string[] = [];
    const walk = (root: Document | ShadowRoot): void => {
      for (const el of root.querySelectorAll("*")) {
        if (el.shadowRoot) walk(el.shadowRoot);
      }
      parts.push(root.textContent ?? "");
    };
    walk(document);
    return parts.join("\n").replace(/\s+/g, " ");
  });

/** 条件が真になるまで待つ（決まった秒数は待たない） */
export const waitFor = async <T>(
  probe: () => Promise<T | undefined>,
  what: string,
  timeoutMs = 45_000,
): Promise<T> => {
  const until = Date.now() + timeoutMs;
  for (;;) {
    const value = await probe();
    if (value !== undefined) return value;
    if (Date.now() > until) throw new Error(`待ちきれなかった: ${what}`);
    await new Promise((r) => setTimeout(r, 250));
  }
};

/** ビューアが IndexedDB に残す、署名の照合の結果（matched） */
export const signatureMatched = (page: Page): Promise<unknown> =>
  page.evaluate(async () => {
    for (const d of await indexedDB.databases()) {
      if (!d.name?.startsWith("db:")) continue;
      const db = await new Promise<IDBDatabase>((ok, ng) => {
        const q = indexedDB.open(d.name!);
        q.onsuccess = () => ok(q.result);
        q.onerror = () => ng(new Error(`indexedDB.open: ${String(q.error)}`));
      });
      if (!db.objectStoreNames.contains("verification")) continue;
      const all = await new Promise<{ id: string; matched: unknown }[]>((ok) => {
        const q = db.transaction("verification").objectStore("verification").getAll();
        q.onsuccess = () => ok(q.result as { id: string; matched: unknown }[]);
      });
      const sig = all.find((r) => r.id === "signature");
      if (sig) return sig.matched;
    }
    return undefined;
  });
