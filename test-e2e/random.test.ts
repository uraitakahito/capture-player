// 乱数の控え（CAPTURE-378）: 同じスクリプトの n 回目の Math.random・crypto.getRandomValues に、控えの n 番目の値を
// 返すか。見本は test-e2e/fixtures/README.md の「乱数の控え」（BrowserHive v31.1.0 の e2e が撮った本物と、
// そこから作った 2 本）。
//
// 見本の頁は capture-fixtures の /random/pick と /random/bytes。1 回引いた値を 0 … 999999 の数 n にし、
// /random/img/<n>.svg の絵を足して題を `pick <n>` にする。控えが無ければ wombat の固定の種の Math.random
// （種は文書の時刻の秒）が値を出す（getRandomValues もそれで埋める）。
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Server } from "node:http";
import type { Browser, Frame, Page } from "puppeteer-core";

import type { RunningViewer } from "../src/run.js";
import { launch, startFixtures, startViewer, waitFor } from "./helpers.js";

const HOST = "http://capture-fixtures-1-a.browserhive:8080";
const PICK = `${HOST}/random/pick`;
const FRAME = `${HOST}/random/frame`;
const BYTES = `${HOST}/random/bytes`;

// 文書の記録の時刻（index.cdxj）と、控えの値から決まる数
const TS = {
  pick: "20261114084732",
  frame: "20261114084735",
  bytes: "20261114084734",
  twice1: "20261114084738",
  twice2: "20261114084739",
};
const RECORDED = {
  pick: Math.floor(0.9604632342795921 * 1e6),
  frame: Math.floor(0.70543710049348 * 1e6),
  twice1: Math.floor(0.3193780804432035 * 1e6),
  twice2: Math.floor(0.8710058479768352 * 1e6),
  // "AOvwqQ==" の 4 バイトを Uint32Array（little-endian）で読んだ数
  bytes: Buffer.from("AOvwqQ==", "base64").readUInt32LE(0) % 1e6,
};

/** wombat の initSeededRandom の最初の値（種は wbinfo.wombat_sec = 文書の時刻の秒） */
const lcgFirst = (ts: string): number => {
  const iso = `${ts.slice(0, 4)}-${ts.slice(4, 6)}-${ts.slice(6, 8)}T${ts.slice(8, 10)}:${ts.slice(10, 12)}:${ts.slice(12, 14)}Z`;
  const seed = (Math.floor(Date.parse(iso) / 1000) * 9301 + 49297) % 233280;
  return seed / 233280;
};
const lcgPick = (ts: string) => Math.floor(lcgFirst(ts) * 1e6);
/** wombat の getRandomValues の埋め方で Uint32Array(1) を埋めた数 */
const lcgBytes = (ts: string) => (Math.floor(lcgFirst(ts) * 4294967296) >>> 0) % 1e6;

let viewer: RunningViewer;
let origin: string;
let fixtures: Server;
let base: string;
let browser: Browser;

beforeAll(async () => {
  ({ viewer, origin } = await startViewer());
  ({ server: fixtures, base } = await startFixtures());
  browser = await launch();
});

afterAll(async () => {
  await browser.close();
  await viewer.shutdown();
  await new Promise((ok) => fixtures.close(ok));
});

interface Picked {
  n: number;
  loaded: boolean;
  src: string;
  hasScript: boolean;
}

/** 再生の URL（`…<ts><mod>/<記録の URL>`）が url の枠 */
const frameOf = (page: Page, url: string): Promise<Frame> =>
  waitFor(
    () => Promise.resolve(page.frames().find((f: Frame) => f.url().endsWith(`_/${url}`))),
    `${url} の枠`,
  );

/** 枠の頁が選んだ数と、その絵が出たか */
const pickedIn = (frame: Frame): Promise<Picked> =>
  waitFor(
    () =>
      frame
        .evaluate(() => {
          const img = document.querySelector<HTMLImageElement>("img#pick");
          const m = /^pick (\d+)$/.exec(document.title);
          if (!img || !m || !img.complete) return undefined;
          return {
            n: Number(m[1]),
            loaded: img.naturalWidth > 0,
            src: img.currentSrc,
            hasScript: !!document.querySelector("script[src*='capturePlayerRandom.js']"),
          };
        })
        .catch(() => undefined),
    "頁が選んだ数",
  );

/** 見本を新しい profile で開く */
const open = async (name: string, url: string, ts: string): Promise<Page> => {
  const context = await browser.createBrowserContext();
  const page = await context.newPage();
  await page.setViewport({ width: 1200, height: 900 });
  const hash = new URLSearchParams({ view: "replay", url, ts });
  await page.goto(
    `${origin}/?source=${encodeURIComponent(`${base}/${name}.wacz`)}#${hash.toString()}`,
  );
  return page;
};

const pick = async (
  name: string,
  url: string,
  ts: string,
): Promise<{ page: Page; picked: Picked }> => {
  const page = await open(name, url, ts);
  return { page, picked: await pickedIn(await frameOf(page, url)) };
};

/** 再生の帯の、乱数の控えの印（shadow DOM の中）。無ければ null */
const badge = (page: Page): Promise<{ text: string; title: string } | null> =>
  page.evaluate(() => {
    const find = (root: Document | ShadowRoot): Element | null => {
      const hit = root.querySelector("#random-badge");
      if (hit) return hit;
      for (const el of root.querySelectorAll("*")) {
        if (el.shadowRoot) {
          const inner = find(el.shadowRoot);
          if (inner) return inner;
        }
      }
      return null;
    };
    const el = find(document);
    return el
      ? {
          text: (el.textContent ?? "").replace(/\s+/g, " ").trim(),
          title: el.getAttribute("title") ?? "",
        }
      : null;
  });

const shownBadge = (page: Page) =>
  waitFor(() => badge(page).then((b) => b ?? undefined), "乱数の印");

describe("見本の前提", () => {
  it("控えから決まる数は、wombat の固定の種が出す数と違う", () => {
    expect(RECORDED).toEqual({
      pick: 960463,
      frame: 705437,
      twice1: 319378,
      twice2: 871005,
      bytes: 138304,
    });
    expect(RECORDED.pick).not.toBe(lcgPick(TS.pick));
    // frame の中の文書の種は、その文書の記録の時刻（frame の文書と同じ秒）
    expect(RECORDED.frame).not.toBe(lcgPick(TS.frame));
    expect(RECORDED.twice1).not.toBe(lcgPick(TS.twice1));
    expect(RECORDED.twice2).not.toBe(lcgPick(TS.twice2));
    expect(RECORDED.twice2).not.toBe(lcgPick(TS.twice1));
    expect(RECORDED.bytes).not.toBe(lcgBytes(TS.bytes));
  });
});

describe("乱数の控え", () => {
  it("控えのある文書では、pick.js の 1 回目の Math.random に控えの値を返し、その絵が出る", async () => {
    const { picked } = await pick("random-pick", PICK, TS.pick);
    expect(picked.n).toBe(RECORDED.pick);
    expect(picked.src).toContain(`/random/img/${String(RECORDED.pick)}.svg`);
    expect(picked.loaded).toBe(true);
    expect(picked.hasScript).toBe(true);
  });

  it("控えの値を返した文書では、再生の帯に印と数を出す", async () => {
    const { page } = await pick("random-pick", PICK, TS.pick);
    const shown = await shownBadge(page);
    expect(shown.text).toBe("Random: recorded values");
    expect(shown.title).toBe("recorded 1 · returned 1 · fallback 0");
  });

  it("frame の中の文書には、その文書の行の値を返し、帯の数にも入れる", async () => {
    const page = await open("random-frame", FRAME, TS.frame);
    const picked = await pickedIn(await frameOf(page, PICK));
    expect(picked.n).toBe(RECORDED.frame);
    expect(picked.src).toContain(`/random/img/${String(RECORDED.frame)}.svg`);
    expect(picked.loaded).toBe(true);
    // 一番上の文書（/random/frame）は draw の行を持たないので、script を挿し込まない
    const top = await frameOf(page, FRAME);
    expect(
      await top.evaluate(() => !!document.querySelector("script[src*='capturePlayerRandom.js']")),
    ).toBe(false);
    expect((await shownBadge(page)).title).toBe("recorded 1 · returned 1 · fallback 0");
  });

  it("crypto.getRandomValues には、控えの 4 バイトを返す", async () => {
    const { page, picked } = await pick("random-bytes", BYTES, TS.bytes);
    expect(picked.n).toBe(RECORDED.bytes);
    expect(picked.src).toContain(`/random/img/${String(RECORDED.bytes)}.svg`);
    expect(picked.loaded).toBe(true);
    expect((await shownBadge(page)).title).toBe("recorded 1 · returned 1 · fallback 0");
  });

  it("同じ URL を 2 度撮った WACZ では、2 つ目の文書の時刻で開くと 2 つ目の行を使う", async () => {
    const { picked } = await pick("random-twice", PICK, TS.twice2);
    expect(picked.n).toBe(RECORDED.twice2);
    expect(picked.loaded).toBe(true);
  });

  it("同じ URL を 2 度撮った WACZ では、1 つ目の文書の時刻で開くと 1 つ目の行を使う", async () => {
    const { picked } = await pick("random-twice", PICK, TS.twice1);
    expect(picked.n).toBe(RECORDED.twice1);
    expect(picked.loaded).toBe(true);
  });

  it("控えの無い WACZ は今までどおり wombat の固定の種の値を使い、印を出さない", async () => {
    const { page, picked } = await pick("random-none", PICK, TS.pick);
    expect(picked.n).toBe(lcgPick(TS.pick));
    expect(picked.src).toContain(`/random/img/${String(lcgPick(TS.pick))}.svg`);
    expect(picked.hasScript).toBe(false);
    expect(await badge(page)).toBeNull();
  });

  it("hash の合わない控えは使わない", async () => {
    const { page, picked } = await pick("random-tampered", PICK, TS.pick);
    expect(picked.n).toBe(lcgPick(TS.pick));
    expect(picked.hasScript).toBe(false);
    expect(await badge(page)).toBeNull();
  });
});
