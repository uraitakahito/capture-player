// 合本の <frame> の中の遷移（CAPTURE-245）。見本は test-e2e/fixtures/README.md の「合本」。
//
// 上流の wabac.js は、頁の遷移を destination が document か iframe のときだけと見る。<frame> の中の
// リンクを押すと destination は frame で、頁の問い（pagesQueryUrl）を使わず、起点と先頭の 3 本の WACZ しか
// 探さない。見本の合本は、押す先（leaf-2）を 6 番目に置いてあるので、直しが無いと Not Found になる。
// 同じ頁を <iframe> の中から押すと、直しが無くても見つかる（対照）。
import { readFileSync } from "node:fs";
import type { Server } from "node:http";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Browser, Frame, Page } from "puppeteer-core";

import type { RunningViewer } from "../src/run.js";
import { ROOT, launch, startFixtures, startViewer, waitFor } from "./helpers.js";

const PLACE = "org/test/crawls/00000000-0000-4000-8000-000000000245/r1";
const replay = JSON.parse(
  readFileSync(join(ROOT, "test-e2e", "fixtures", "bucket", PLACE, "replay.json"), "utf8"),
) as { initialPages: { url: string; ts: string }[] };

let viewer: RunningViewer;
let origin: string;
let fixtures: Server;
let browser: Browser;

beforeAll(async () => {
  let base: string;
  ({ server: fixtures, base } = await startFixtures());
  ({ viewer, origin } = await startViewer(`${base}/bucket`));
  browser = await launch();
});

afterAll(async () => {
  await browser.close();
  await viewer.shutdown();
  await new Promise((ok) => fixtures.close(ok));
});

/** 合本の頁を開く（workbench のリンクと同じ形の URL） */
const openPage = async (path: string): Promise<Page> => {
  const entry = replay.initialPages.find((p) => p.url.endsWith(path));
  if (entry === undefined) throw new Error(`見本の合本に ${path} が無い`);
  const ts = entry.ts.replace(/[^0-9]/g, "").slice(0, 14);
  const context = await browser.createBrowserContext();
  const page = await context.newPage();
  await page.setViewport({ width: 1200, height: 900 });
  const hash = new URLSearchParams({ view: "replay", url: entry.url, ts });
  await page.goto(
    `${origin}/?source=${encodeURIComponent(`/wacz/${PLACE}/replay.json`)}#${hash.toString()}`,
  );
  return page;
};

const frameAt = (page: Page, path: string): Promise<Frame> =>
  waitFor(
    () => Promise.resolve(page.frames().find((f) => new URL(f.url()).pathname.endsWith(path))),
    `${path} の枠`,
  );

/**
 * menu の枠から leaf 2 へ移り、移った枠に出た物の題と文字を返す。
 *
 * - `click`: リンクを押す。`target="right"` なので、frameset の右の枠が移る（destination は frame）
 * - `self`: リンクの target を `_self` にして押し、menu の枠そのものを移す。iframe の頁には right の窓が無いので、
 *   対照はこの形（destination は iframe）
 */
const toLeaf2 = async (
  page: Page,
  how: "click" | "self",
): Promise<{ title: string; text: string }> => {
  const menu = await frameAt(page, "/links/frame/menu");
  await waitFor(
    () => menu.$("a[href$='/links/leaf/2']").then((a) => a ?? undefined),
    "leaf 2 のリンク",
  );
  await menu.$eval(
    "a[href$='/links/leaf/2']",
    (a, mode) => {
      const link = a;
      if (mode === "self") link.target = "_self";
      link.click();
    },
    how,
  );
  const target = await frameAt(page, "/links/leaf/2");
  return waitFor(
    () =>
      target
        .evaluate(() => ({ title: document.title, text: document.body.innerText }))
        .then((r) => (r.text.trim() === "" ? undefined : r))
        .catch(() => undefined),
    "leaf 2 の枠の中身",
  );
};

describe("合本の <frame> の中の遷移", () => {
  it("<frameset> の menu の枠で押した先を、頁の問いで別の WACZ から出す", async () => {
    const page = await openPage("/links/frameset");
    const shown = await toLeaf2(page, "click");
    expect(shown.text).not.toContain("Not Found");
    expect(shown).toMatchObject({ title: "leaf" });
    expect(shown.text).toContain("leaf");
    await page.browserContext().close();
  });

  it("対照: 同じ先へ <iframe> の枠が移っても出る", async () => {
    const page = await openPage("/links/iframe");
    const shown = await toLeaf2(page, "self");
    expect(shown.text).not.toContain("Not Found");
    expect(shown).toMatchObject({ title: "leaf" });
    await page.browserContext().close();
  });
});
