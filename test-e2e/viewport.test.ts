// 撮った時の窓で再生する（CAPTURE-422）。見本は test-e2e/fixtures/README.md の「撮った時の窓」（capture-fixtures v0.37.0 の
// /viewport/* を、手元の BrowserHive v31.1.0 で 1280×800・DPR 1 などで撮った物）。
//
// 頁はどれも、窓に合わせて選んだ絵の名前を描いた SVG（/viewport/img/<名前>.svg）を求める。記録に在るのは撮った窓が
// 求めた版だけ。撮った時の窓で再生すれば、見る人の窓が何でも、記録に在る版を求める。見せ方を「いまの窓」にすると、
// 見る人の窓の版を求める（対照）。名前は試験に書き込む（capture-fixtures の表を写さない）。
import type { Server } from "node:http";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Browser, Frame, Page } from "puppeteer-core";

import type { RunningViewer } from "../src/run.js";
import { launch, startFixtures, startViewer, waitFor } from "./helpers.js";

const HOST = "http://127.0.0.1:19461";
const BUNDLE = "org/test/crawls/00000000-0000-4000-8000-000000000422/r1";

// 文書の記録の時刻（pages.jsonl）
const TS: Record<string, string> = {
  "viewport-picture-width": "20261114120025",
  "viewport-picture-height": "20261114120027",
  "viewport-js-dpr": "20261114120029",
  "viewport-js-height": "20261114120032",
  "viewport-image-set": "20261114120034",
  "viewport-js-dpr-twice": "20261114120036",
  "viewport-narrow": "20261114120041",
};

/** 撮った窓（1280×800・DPR 1）で、頁が求めた名前。記録に在るのはこれだけ */
const CAPTURED: Record<string, string[]> = {
  "picture-width": ["width-l-1x"],
  "picture-height": ["height-tall-1x"],
  "js-dpr": ["js-1x"],
  "js-height": ["jsheight-tall"],
  "image-set": ["res-1x", "set-1x"],
};

/** 見る人の窓 */
const WINDOWS = [
  { width: 1512, height: 982, dpr: 2, label: "1512×982・DPR 2" },
  { width: 1280, height: 800, dpr: 1, label: "1280×800・DPR 1" },
  { width: 390, height: 844, dpr: 2, label: "390×844・DPR 2" },
] as const;

let viewer: RunningViewer;
let origin: string;
let fixtures: Server;
let base: string;
let browser: Browser;

beforeAll(async () => {
  ({ server: fixtures, base } = await startFixtures());
  ({ viewer, origin } = await startViewer(`${base}/bucket`));
  browser = await launch();
});

afterAll(async () => {
  await browser.close();
  await viewer.shutdown();
  await new Promise((ok) => fixtures.close(ok));
});

interface Win {
  width: number;
  height: number;
  dpr: number;
}

/** 見本 1 本（または合本）を、新しい profile と窓で開く。開いた頁と、文書を読んだ回数を数える関数を返す */
const open = async (
  source: string,
  url: string,
  ts: string,
  win: Win,
): Promise<{ page: Page; documentLoads: () => number }> => {
  const context = await browser.createBrowserContext();
  const page = await context.newPage();
  await page.setViewport({ width: win.width, height: win.height, deviceScaleFactor: win.dpr });
  let loads = 0;
  // 頁の移動を数える（wabac.js は最初の要求を `:<hash>/` の付いた URL へ転送するので、要求の数では 2 になる）
  page.on("framenavigated", (f) => {
    if (f.url().endsWith(`mp_/${url}`)) loads += 1;
  });
  const hash = new URLSearchParams({ view: "replay", url, ts });
  await page.goto(`${origin}/?source=${encodeURIComponent(source)}#${hash.toString()}`);
  return { page, documentLoads: () => loads };
};

const sourceOf = (name: string) => `${base}/${name}.wacz`;

/** 再生の URL（`…<ts><mod>/<記録の URL>`）が url の枠 */
const frameOf = (page: Page, url: string): Promise<Frame> =>
  waitFor(
    () => Promise.resolve(page.frames().find((f: Frame) => f.url().endsWith(`_/${url}`))),
    `${url} の枠`,
  );

interface Seen {
  inner: string;
  dpr: number;
  res1: boolean;
  images: string[];
}

/** 枠の中の窓の値と、頁が求めた絵の名前（読み込みが済み、絵を求め終えてから） */
const seenIn = (frame: Frame, count: number): Promise<Seen> =>
  waitFor(
    () =>
      frame
        .evaluate((n: number) => {
          const images = performance
            .getEntriesByType("resource")
            .map((e) => /\/viewport\/img\/([a-z0-9-]+)\.svg/.exec(e.name)?.[1])
            .filter((x): x is string => x !== undefined)
            .sort();
          if (document.readyState !== "complete" || images.length < n) return undefined;
          return {
            inner: `${String(innerWidth)}×${String(innerHeight)}`,
            dpr: devicePixelRatio,
            res1: matchMedia("(resolution: 1dppx)").matches,
            images,
          };
        }, count)
        .catch(() => undefined),
    "枠の中の値",
  );

/** 枠の上の 1 行（shadow DOM の中）。無ければ null */
const bar = (page: Page): Promise<string | null> =>
  page.evaluate(() => {
    const find = (root: Document | ShadowRoot): Element | null => {
      const hit = root.querySelector("#capture-bar");
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
    return el ? (el.textContent ?? "").replace(/\s+/g, " ").trim() : null;
  });

/** 1 行の切り替えを押す */
const press = (page: Page, label: string): Promise<void> =>
  page.evaluate((text: string) => {
    const find = (root: Document | ShadowRoot): HTMLButtonElement | null => {
      for (const b of root.querySelectorAll<HTMLButtonElement>("#capture-bar button")) {
        if ((b.textContent ?? "").trim() === text) return b;
      }
      for (const el of root.querySelectorAll("*")) {
        if (el.shadowRoot) {
          const inner = find(el.shadowRoot);
          if (inner) return inner;
        }
      }
      return null;
    };
    const button = find(document);
    if (!button) throw new Error(`切り替え ${text} が無い`);
    button.click();
  }, label);

const barText = (page: Page, want: RegExp): Promise<string> =>
  waitFor(
    () => bar(page).then((t) => (t !== null && want.test(t) ? t : undefined)),
    `1 行 ${String(want)}`,
  );

describe("撮った時の窓（既定）", () => {
  // 窓 × 頁ごとに 1 本。頁が求めた名前だけを見る（壊し方ごとに、狙った頁だけが赤になるように）
  it.each(
    WINDOWS.flatMap((win) =>
      Object.entries(CAPTURED).map(([name, images]) => [win.label, name, win, images] as const),
    ),
  )("%s の窓で %s は、撮った時の窓の版だけを求める", async (_label, name, win, images) => {
    const url = `${HOST}/viewport/${name}`;
    const { page, documentLoads } = await open(
      sourceOf(`viewport-${name}`),
      url,
      TS[`viewport-${name}`]!,
      win,
    );
    const seen = await seenIn(await frameOf(page, url), images.length);
    expect(seen.images).toEqual(images);
    // 先に環境を訊けたので、文書は 1 度だけ読む
    expect(documentLoads()).toBe(1);
    await barText(page, /^Capture window 1280×800 · DPR 1 — scaled to \d+%/);
    await page.browserContext().close();
  });

  it("枠の中の窓は撮った時の値（1512×982・DPR 2 の窓で、1280×800・DPR 1・1dppx）", async () => {
    const url = `${HOST}/viewport/picture-width`;
    const { page } = await open(
      sourceOf("viewport-picture-width"),
      url,
      TS["viewport-picture-width"]!,
      WINDOWS[0],
    );
    const seen = await seenIn(await frameOf(page, url), 1);
    expect({ inner: seen.inner, dpr: seen.dpr, res1: seen.res1 }).toEqual({
      inner: "1280×800",
      dpr: 1,
      res1: true,
    });
    await page.browserContext().close();
  });

  it("撮った窓が 1000×700 の WACZ は、その大きさの枠で開く（1280×800 の決め打ちではない）", async () => {
    const url = `${HOST}/viewport/picture-width`;
    const { page } = await open(
      sourceOf("viewport-narrow"),
      url,
      TS["viewport-narrow"]!,
      WINDOWS[0],
    );
    const seen = await seenIn(await frameOf(page, url), 1);
    expect({ inner: seen.inner, images: seen.images }).toEqual({
      inner: "1000×700",
      images: ["width-m-1x"],
    });
    await barText(page, /^Capture window 1000×700 · DPR 1/);
    await page.browserContext().close();
  });

  it("DPR を 2 つ読んだ WACZ は、1 行に読んだ DPR を全部書く", async () => {
    const url = `${HOST}/viewport/js-dpr`;
    const { page } = await open(
      sourceOf("viewport-js-dpr-twice"),
      url,
      TS["viewport-js-dpr-twice"]!,
      WINDOWS[0],
    );
    await seenIn(await frameOf(page, url), 1);
    await barText(page, /^Capture window 1280×800 · DPR \d \(captured at 1, 2\)/);
    await page.browserContext().close();
  });
});

describe("切り替え", () => {
  it("「Use my window」は見る人の窓で開き直し、DPR 2 の窓の版を求める。JS が読む DPR は撮った時のまま（対照）", async () => {
    const url = `${HOST}/viewport/picture-width`;
    const { page } = await open(
      sourceOf("viewport-picture-width"),
      url,
      TS["viewport-picture-width"]!,
      WINDOWS[0],
    );
    await seenIn(await frameOf(page, url), 1);
    await press(page, "Use my window");
    await barText(page, /^Your window — images and layout may differ from the capture/);
    const seen = await waitFor(async () => {
      const s = await seenIn(await frameOf(page, url), 1).catch(() => undefined);
      return s?.images.includes("width-xl-2x") ? s : undefined;
    }, "いまの窓の版");
    expect(seen.res1).toBe(false);
    expect(seen.dpr).toBe(1);
    await press(page, "Use capture window");
    await barText(page, /^Capture window 1280×800/);
    await page.browserContext().close();
  });

  it("「Actual size」は同じ枠を縮めずに置く", async () => {
    const url = `${HOST}/viewport/picture-width`;
    const { page } = await open(
      sourceOf("viewport-picture-width"),
      url,
      TS["viewport-picture-width"]!,
      WINDOWS[2],
    );
    const frame = await frameOf(page, url);
    await seenIn(frame, 1);
    await press(page, "Actual size");
    await barText(page, /^Capture window 1280×800 · DPR 1 — actual size/);
    const width = await waitFor(
      () =>
        frame
          .frameElement()
          .then((el) => el?.boundingBox())
          .then((box) => (box && Math.round(box.width) === 1280 ? box.width : undefined)),
      "等倍の枠の幅",
    );
    expect(Math.round(width)).toBe(1280);
    await page.browserContext().close();
  });
});

describe("1 行の色", () => {
  // 利用者の Mac で、ボタンが白い枠だけで字が見えなかった（2026-11-14）。:host の color-scheme が light dark で、
  // ダークモードではボタンの字の既定の色が白になり、地も白だったため。字と地の色が違うことを、両方のモードで見る
  it.each(["light", "dark"] as const)("%s モードでも、切り替えの字は地と違う色", async (scheme) => {
    const url = `${HOST}/viewport/picture-width`;
    const context = await browser.createBrowserContext();
    const page = await context.newPage();
    await page.emulateMediaFeatures([{ name: "prefers-color-scheme", value: scheme }]);
    await page.setViewport({ width: 1200, height: 900 });
    const hash = new URLSearchParams({ view: "replay", url, ts: TS["viewport-picture-width"]! });
    await page.goto(
      `${origin}/?source=${encodeURIComponent(sourceOf("viewport-picture-width"))}#${hash.toString()}`,
    );
    await barText(page, /^Capture window 1280×800/);
    const colors = await page.evaluate(() => {
      const find = (root: Document | ShadowRoot): Element | null => {
        const hit = root.querySelector("#capture-bar");
        if (hit) return hit;
        for (const el of root.querySelectorAll("*")) {
          if (el.shadowRoot) {
            const inner = find(el.shadowRoot);
            if (inner) return inner;
          }
        }
        return null;
      };
      return [...(find(document)?.querySelectorAll("button") ?? [])].map((b) => {
        const s = getComputedStyle(b);
        return {
          text: (b.textContent ?? "").trim(),
          color: s.color,
          background: s.backgroundColor,
        };
      });
    });
    expect(colors.map((c) => c.text)).toEqual(["Actual size", "Use my window"]);
    for (const c of colors) expect(c.color, c.text).not.toBe(c.background);
    await context.close();
  });
});

describe("撮った時の窓の記録が無い WACZ", () => {
  it("上流のまま（窓いっぱい・JS の DPR 2）で開き、その旨を 1 行に書く", async () => {
    const { page } = await open(
      sourceOf("no-browserhive"),
      "http://capture-fixtures.capture-ledger:8080/plain-html",
      "20261110190700",
      WINDOWS[1],
    );
    await barText(page, /^No capture window recorded — shown in your window$/);
    const frame = await waitFor(
      () => Promise.resolve(page.frames().find((f) => f.url().includes("mp_/"))),
      "再生の枠",
    );
    // wombat が値を置いた後（読み込みが済んでから）に読む
    const v = await waitFor(
      () =>
        frame
          .evaluate(() =>
            document.readyState === "complete" && "wbinfo" in window
              ? { w: innerWidth, dpr: devicePixelRatio }
              : undefined,
          )
          .catch(() => undefined),
      "再生の頁の読み込み",
    );
    expect(v.dpr).toBe(2);
    expect(v.w).toBe(1280);
    await page.browserContext().close();
  });
});

describe("合本", () => {
  it("同じ URL を別の窓で撮った 2 本を、それぞれの WACZ の窓で開く（文書は 1 度だけ読む）", async () => {
    const url = `${HOST}/viewport/picture-width`;
    for (const [ts, inner, image] of [
      [TS["viewport-picture-width"]!, "1280×800", "width-l-1x"],
      [TS["viewport-narrow"]!, "1000×700", "width-m-1x"],
    ] as const) {
      const { page, documentLoads } = await open(
        `/wacz/${BUNDLE}/replay.json`,
        url,
        ts,
        WINDOWS[0],
      );
      const seen = await seenIn(await frameOf(page, url), 1);
      expect({ inner: seen.inner, images: seen.images }, ts).toEqual({ inner, images: [image] });
      expect(documentLoads(), ts).toBe(1);
      await page.browserContext().close();
    }
  });
});
