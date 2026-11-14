// 乱数の控え（CAPTURE-378）: 同じスクリプトの n 回目の Math.random に、控えの n 番目の値を返すか。
// 見本は test-e2e/fixtures/README.md の「乱数の控え」（いまは手で組んだ代役。build-random.ts）。
//
// 見本の頁は pick.js が Math.random を 1 回引き、0 … 999999 の数 n の絵（/random/img/<n>.svg）を足し、題を
// `pick <n>` にする。控えが無ければ wombat の固定の種の Math.random（種は文書の時刻の秒）が値を出す。
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Server } from "node:http";
import type { Browser, Frame, Page } from "puppeteer-core";

import type { RunningViewer } from "../src/run.js";
import { launch, startFixtures, startViewer, waitFor } from "./helpers.js";

const PICK = "https://fixtures.test/random/pick";
const T1 = "20261114021000";
const T2 = "20261114022000";

/** wombat の initSeededRandom の最初の値（種は wbinfo.wombat_sec = 文書の時刻の秒） */
const lcgFirst = (ts: string): number => {
  const iso = `${ts.slice(0, 4)}-${ts.slice(4, 6)}-${ts.slice(6, 8)}T${ts.slice(8, 10)}:${ts.slice(10, 12)}:${ts.slice(12, 14)}Z`;
  let seed = Math.floor(Date.parse(iso) / 1000);
  seed = (seed * 9301 + 49297) % 233280;
  return Math.floor((seed / 233280) * 1e6);
};

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

/** 見本を新しい profile で開き、再生した頁が選んだ数と、その絵が出たかを返す */
const pick = async (name: string, ts: string): Promise<{ page: Page; picked: Picked }> => {
  const context = await browser.createBrowserContext();
  const page = await context.newPage();
  await page.setViewport({ width: 1200, height: 900 });
  const hash = new URLSearchParams({ view: "replay", url: PICK, ts });
  await page.goto(
    `${origin}/?source=${encodeURIComponent(`${base}/${name}.wacz`)}#${hash.toString()}`,
  );
  const frame = await waitFor(
    () => Promise.resolve(page.frames().find((f: Frame) => f.url().includes(`mp_/${PICK}`))),
    "再生の枠",
  );
  const picked = await waitFor(
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
    "pick.js が選んだ数",
  );
  return { page, picked };
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

describe("見本の前提", () => {
  it("控えの数は、wombat の固定の種が出す数と違う", () => {
    expect(lcgFirst(T1)).toBe(720066);
    expect(lcgFirst(T2)).toBe(642391);
    for (const n of [123456, 250000, 875000, 333333]) {
      expect(n).not.toBe(lcgFirst(T1));
      expect(n).not.toBe(lcgFirst(T2));
    }
  });
});

describe("乱数の控え", () => {
  it("控えのある文書では、pick.js の 1 回目の Math.random に控えの値を返し、その絵が出る", async () => {
    const { picked } = await pick("random-pick", T1);
    expect(picked.n).toBe(123456);
    expect(picked.src).toContain("/random/img/123456.svg");
    expect(picked.loaded).toBe(true);
    expect(picked.hasScript).toBe(true);
  });

  it("控えの値を返した文書では、再生の帯に印と数を出す", async () => {
    const { page } = await pick("random-pick", T1);
    const shown = await waitFor(() => badge(page).then((b) => b ?? undefined), "乱数の印");
    expect(shown.text).toBe("Random: recorded values");
    expect(shown.title).toBe("recorded 1 · returned 1 · fallback 0");
  });

  it("控えの無い WACZ は今までどおり wombat の固定の種の値を使い、印を出さない", async () => {
    const { page, picked } = await pick("random-none", T1);
    expect(picked.n).toBe(lcgFirst(T1));
    expect(picked.src).toContain(`/random/img/${String(lcgFirst(T1))}.svg`);
    expect(picked.hasScript).toBe(false);
    expect(await badge(page)).toBeNull();
  });

  it("同じ URL を 2 度撮った WACZ では、再生する時刻にいちばん近い文書の行を使う", async () => {
    const { picked } = await pick("random-twice", T2);
    expect(picked.n).toBe(875000);
    expect(picked.loaded).toBe(true);
  });

  it("hash の合わない控えは使わない", async () => {
    const { page, picked } = await pick("random-tampered", T1);
    expect(picked.n).toBe(lcgFirst(T1));
    expect(picked.hasScript).toBe(false);
    expect(await badge(page)).toBeNull();
  });
});
