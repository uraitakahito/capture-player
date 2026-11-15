// 写しの文書の枠を子の写しで開く（CAPTURE-147）。見本は test-e2e/fixtures/README.md の「子フレームの写し」。
//
// BrowserHive v31.2.0 から、DOM の写しは同じ origin の子フレームまで広がる。親の写しの枠の要素は `src` を元のまま残し、
// 子の写しの URI を `data-browserhive-snapshot` に持つ。素の ReplayWeb.page は属性を読まず、枠に記録した元の文書を出す。
// capture-player は写しの文書の枠を子の写しで開く。
//
// 見本は、取り込みにその場のスクリプトを 1 本付けて撮った。スクリプトは名前が right の枠の文書に印の文
// 「frame snapshot marker」（`data-capture-script="marker"`）を、menu・left の枠の文書に「menu snapshot marker」
// （`data-capture-script="menu-marker"`）を足す。記録した元の文書には印が無く、after-behaviors の子の写しにだけ在る。
// だから「枠に印が出る」は、枠が子の写しで開いたときだけ成り立つ。
import { readFileSync } from "node:fs";
import type { Server } from "node:http";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Browser, Frame, Page } from "puppeteer-core";

import type { RunningViewer } from "../src/run.js";
import { ROOT, launch, startFixtures, startViewer, waitFor } from "./helpers.js";

const HOST = "http://127.0.0.1:19471";
const PORTRAIT = `${HOST}/portrait/`;
const NESTED = `${HOST}/links/frameset-nested`;
const IFRAME = `${HOST}/links/iframe`;
const MARK = "frame snapshot marker";
const MENU_MARK = "menu snapshot marker";

/** 4 本を束ねた合本。pages.json に 4 本の文書と写しの行が全部在るので、時刻はここから引く */
const PLACE = "org/test/crawls/00000000-0000-4000-8000-000000000147/r1";
const readBundle = <T>(name: string): T =>
  JSON.parse(readFileSync(join(ROOT, "test-e2e", "fixtures", "bucket", PLACE, name), "utf8")) as T;
const bundlePages = readBundle<{ pages: { url: string; ts: string }[] }>("pages.json").pages;
/** 合本の WACZ の hash（頁の一覧の行のリンクが waczhash に持つ値） */
const waczHash = (name: string): string => {
  const hash = readBundle<{ resources: { name: string; hash: string }[] }>(
    "replay.json",
  ).resources.find((r) => r.name === name)?.hash;
  if (hash === undefined) throw new Error(`見本の replay.json に ${name} が無い`);
  return hash.replace(/^sha256:/, "");
};

/** 頁の一覧の行の時刻（14 桁） */
const tsOf = (url: string): string => {
  const row = bundlePages.find((p) => p.url === url);
  if (row === undefined) throw new Error(`見本の pages.json に ${url} が無い`);
  return row.ts.replace(/[^0-9]/g, "").slice(0, 14);
};
const snapshot = (stage: string, url: string) => `urn:browserhive:snapshot:${stage}:${url}`;
const child = (stage: string, n: number, url: string) =>
  `urn:browserhive:frame-snapshot:${stage}:${String(n)}:${url}`;

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

/** 見本 1 本（`<名前>.wacz`）か合本（`/wacz/…/replay.json`）の頁を、新しい profile で開く */
const open = async (
  source: string,
  url: string,
  { scheme = "light", waczhash }: { scheme?: "light" | "dark"; waczhash?: string } = {},
): Promise<Page> => {
  const context = await browser.createBrowserContext();
  const page = await context.newPage();
  await page.emulateMediaFeatures([{ name: "prefers-color-scheme", value: scheme }]);
  await page.setViewport({ width: 1200, height: 900 });
  const src = source.startsWith("/") ? source : `${base}/${source}.wacz`;
  const hash = new URLSearchParams({ view: "replay", url, ts: tsOf(url) });
  if (waczhash !== undefined) hash.set("waczhash", waczhash);
  await page.goto(`${origin}/?source=${encodeURIComponent(src)}#${hash.toString()}`);
  return page;
};

/** 再生の URL（`…<ts><mod>/<記録の URL>`）が url の枠 */
const frameOf = (page: Page, url: string): Promise<Frame> =>
  waitFor(
    () => Promise.resolve(page.frames().find((f) => f.url().endsWith(`_/${url}`))),
    `${url} の枠`,
  );

/** 枠の文書の文字（空のうちは待つ） */
const textOf = (frame: Frame): Promise<string> =>
  waitFor(
    () =>
      frame
        .evaluate(() => document.body?.innerText ?? "")
        .then((t) => (t.trim() === "" ? undefined : t))
        .catch(() => undefined),
    `${frame.url()} の文字`,
  );

/** 再生の帯の、スクリプトが足した要素の印（shadow DOM の中）。無ければ null */
const marksBadge = (
  page: Page,
): Promise<{ text: string; title: string; color: string; background: string } | null> =>
  page.evaluate(() => {
    const find = (root: Document | ShadowRoot): Element | null => {
      const hit = root.querySelector("#script-marks-badge");
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
    if (!el) return null;
    const style = getComputedStyle(el);
    return {
      text: (el.textContent ?? "").replace(/\s+/g, " ").trim(),
      title: el.getAttribute("title") ?? "",
      color: style.color,
      background: style.backgroundColor,
    };
  });

/** 枠の文書に、数える script（bh-script-marks を送る inline script）が在るか */
const hasMarksScript = (frame: Frame): Promise<boolean> =>
  waitFor(
    () =>
      frame
        .evaluate(() =>
          document.readyState === "loading"
            ? undefined
            : [...document.scripts].some((s) => s.text.includes("bh-script-marks")),
        )
        .catch(() => undefined),
    `${frame.url()} の script`,
  );

/**
 * 枠の文書が DOMContentLoaded を過ぎ（数える script は送り終えている）、その後に一番上の窓で 1 往復の message を
 * 待ち、描画を 2 回待つ。先に送られた message は先に届くので、この後に帯を見れば、送られた数は帯に効いている。
 * 決まった秒数は待たない
 */
const afterSent = async (page: Page, frame: Frame): Promise<void> => {
  await waitFor(
    () =>
      frame
        .evaluate(() => (document.readyState === "loading" ? undefined : true))
        .catch(() => undefined),
    `${frame.url()} の DOMContentLoaded`,
  );
  await page.evaluate(
    () =>
      new Promise<void>((ok) => {
        const probe = `probe-${String(Math.random())}`;
        const on = (e: MessageEvent) => {
          if (e.data === probe) {
            window.removeEventListener("message", on);
            requestAnimationFrame(() => requestAnimationFrame(() => ok()));
          }
        };
        window.addEventListener("message", on);
        window.postMessage(probe, "*");
      }),
  );
};

const shownBadge = (page: Page) =>
  waitFor(() => marksBadge(page).then((b) => b ?? undefined), "スクリプトが足した要素の印");

describe("写しの文書の枠", () => {
  it("写しの頁を開くと、右の枠は子の写しで開き、子の写しにだけ在る印の文が出る", async () => {
    const page = await open("frame-snapshots", snapshot("after-behaviors", PORTRAIT));
    const right = await frameOf(page, child("after-behaviors", 2, `${PORTRAIT}top.htm`));
    const text = await textOf(right);
    expect(text).toContain(MARK);
    expect(text).toContain("肖像のホームページ");
    // 子の写しの中の相対の参照（<base> で解く）も記録から出る
    const image = await waitFor(
      () =>
        right
          .evaluate(() => {
            const img = document.querySelector("img");
            return img?.complete ? img.naturalWidth : undefined;
          })
          .catch(() => undefined),
      "子の写しの絵",
    );
    expect(image).toBeGreaterThan(0);
    const left = await frameOf(page, child("after-behaviors", 1, `${PORTRAIT}menu.htm`));
    expect(await textOf(left)).toContain(MENU_MARK);
    await page.browserContext().close();
  });

  it("文書の行（記録した元の文書）の枠は記録の文書で開き、印は出ない", async () => {
    const page = await open("frame-snapshots", PORTRAIT);
    const right = await frameOf(page, `${PORTRAIT}top.htm`);
    const text = await textOf(right);
    // 在るはずの物が在ることを同じ文書で見てから、無いことを見る
    expect(text).toContain("肖像のホームページ");
    expect(text).not.toContain(MARK);
    expect(page.frames().some((f) => f.url().includes("urn:browserhive:frame-snapshot:"))).toBe(
      false,
    );
    await page.browserContext().close();
  });

  it("after-load の写しの枠は after-load の子の写しで開く（スクリプトの前なので印は無い）", async () => {
    const page = await open("frame-snapshots", snapshot("after-load", PORTRAIT));
    const right = await frameOf(page, child("after-load", 2, `${PORTRAIT}top.htm`));
    const text = await textOf(right);
    expect(text).toContain("肖像のホームページ");
    expect(text).not.toContain(MARK);
    await page.browserContext().close();
  });

  it("入れ子: 子の写しの中の枠も、その子の写しで開く", async () => {
    const page = await open("frame-snapshots-nested", snapshot("after-behaviors", NESTED));
    await frameOf(page, child("after-behaviors", 1, `${HOST}/links/frameset`));
    const right = await frameOf(page, child("after-behaviors", 3, `${HOST}/links/frame/empty`));
    expect(await textOf(right)).toContain(MARK);
    const menu = await frameOf(page, child("after-behaviors", 2, `${HOST}/links/frame/menu`));
    expect(await textOf(menu)).toContain(MENU_MARK);
    await page.browserContext().close();
  });

  it("iframe の枠も子の写しで開く", async () => {
    const page = await open("frame-snapshots-iframe", snapshot("after-behaviors", IFRAME));
    const menu = await frameOf(page, child("after-behaviors", 1, `${HOST}/links/frame/menu`));
    expect(await textOf(menu)).toContain(MENU_MARK);
    await page.browserContext().close();
  });

  it("4 本の合本でも、写しの頁の枠を子の写しで開く", async () => {
    // 合本の写しの行は、頁の一覧のリンクと同じく waczhash で WACZ を名指して開く。写しの行の WACZ を知る手は、
    // replay.json の initialPages（手元の IndexedDB に入る頁）の行の filename だけ —— 一覧のリンクの waczhash はそこから
    // 付き、waczhash を付けずに開いても getPagesByUrl がその行に当たる（CAPTURE-456 で写しの行が入ってから。2026-11-15 に
    // 確かめた）。`/q/?url=` は http(s) でない URL を 0 件で返す（keys を足しても同じ）。どちらも無いと、replay は WACZ の
    // 名前の順の先頭 3 本しか探さない（multiwacz.ts の getWACZFilesToTry）。portrait.wacz は 4 番目で、その外。子の写しの
    // 要求も同じ WACZ を名指す
    const source = `/wacz/${PLACE}/replay.json`;
    const page = await open(source, snapshot("after-behaviors", PORTRAIT), {
      waczhash: waczHash("portrait.wacz"),
    });
    const right = await frameOf(page, child("after-behaviors", 2, `${PORTRAIT}top.htm`));
    expect(await textOf(right)).toContain(MARK);
    const nested = await open(source, snapshot("after-behaviors", NESTED), {
      waczhash: waczHash("nested.wacz"),
    });
    const inner = await frameOf(nested, child("after-behaviors", 3, `${HOST}/links/frame/empty`));
    expect(await textOf(inner)).toContain(MARK);
    await page.browserContext().close();
    await nested.browserContext().close();
  });

  it("合本の頁の一覧に写しの行が並び、portrait のスクリプトの後の写しを押すと、右の枠に子の写しにだけ在る印の文が出る", async () => {
    // 一覧の 1 ページ目は replay.json の initialPages から作られる（CAPTURE-456 から写しの行も入る）。行のリンクは行の
    // filename から付いた waczhash を持ち、押すとその WACZ を名指して開く。portrait.wacz は名前の順で 4 番目。
    // ただし一覧を開くと、写しの行の filename が無くても portrait.wacz は別の道（文書の行の keys に当たる `/q/?url=`）で
    // 読み込まれ、押せば印が出る（2026-11-15 に確かめた。test-e2e/fixtures/README.md）。だから waczhash はリンクで見る
    const context = await browser.createBrowserContext();
    const page = await context.newPage();
    await page.setViewport({ width: 1200, height: 900 });
    await page.goto(
      `${origin}/?source=${encodeURIComponent(`/wacz/${PLACE}/replay.json`)}#view=pages`,
    );
    /** 一覧の行（wr-page-entry）のリンクが指す記録の URL と waczhash を、上から順に */
    const listed = (): Promise<{ url: string; waczhash: string | null }[]> =>
      page.evaluate(() => {
        const rows: { url: string; waczhash: string | null }[] = [];
        const walk = (root: Document | ShadowRoot): void => {
          for (const el of root.querySelectorAll("*")) {
            if (el.localName === "wr-page-entry") {
              const href = el.shadowRoot?.querySelector("a[href]")?.getAttribute("href") ?? "";
              const params = new URLSearchParams(href.replace(/^#/, ""));
              rows.push({ url: params.get("url") ?? "", waczhash: params.get("waczhash") });
            }
            if (el.shadowRoot) walk(el.shadowRoot);
          }
        };
        walk(document);
        return rows;
      });
    const rows = await waitFor(
      () => listed().then((r) => (r.length === bundlePages.length ? r : undefined)),
      "合本の一覧の行",
    );
    // 文書の行も写しの行も、pages.json の行が全部並ぶ（after-load・after-behaviors の両方）
    expect(rows.map((r) => r.url).sort()).toEqual(bundlePages.map((p) => p.url).sort());
    const target = snapshot("after-behaviors", PORTRAIT);
    expect(rows.find((r) => r.url === target)?.waczhash).toBe(waczHash("portrait.wacz"));
    const clicked = await page.evaluate((url) => {
      const walk = (root: Document | ShadowRoot): HTMLElement | null => {
        for (const el of root.querySelectorAll("*")) {
          if (el.localName === "wr-page-entry") {
            const a = el.shadowRoot?.querySelector<HTMLElement>("a[href]");
            const href = a?.getAttribute("href") ?? "";
            if (a && new URLSearchParams(href.replace(/^#/, "")).get("url") === url) return a;
          }
          const inner = el.shadowRoot ? walk(el.shadowRoot) : null;
          if (inner) return inner;
        }
        return null;
      };
      const link = walk(document);
      link?.click();
      return link !== null;
    }, target);
    expect(clicked).toBe(true);
    const right = await frameOf(page, child("after-behaviors", 2, `${PORTRAIT}top.htm`));
    const text = await textOf(right);
    expect(text).toContain("肖像のホームページ");
    expect(text).toContain(MARK);
    await context.close();
  });
});

describe("スクリプトが足した要素の数", () => {
  it("写しの頁では、主と枠の中の子の写しの数を足して帯に出す", async () => {
    const page = await open("frame-snapshots", snapshot("after-behaviors", PORTRAIT));
    const badge = await shownBadge(page);
    // 主の写し（frameset）には 0、左の子に menu-marker 1、右の子に marker 1
    expect(badge.text).toBe("Script-added elements: 2");
    expect(badge.title).toBe("marker 1 · menu-marker 1");
    await page.browserContext().close();
  });

  it("入れ子でも、孫の写しまで足す", async () => {
    const page = await open("frame-snapshots-nested", snapshot("after-behaviors", NESTED));
    const badge = await shownBadge(page);
    expect(badge.text).toBe("Script-added elements: 2");
    expect(badge.title).toBe("marker 1 · menu-marker 1");
    await page.browserContext().close();
  });

  it("要素の無い写し（after-load）では出さない", async () => {
    const page = await open("frame-snapshots", snapshot("after-load", PORTRAIT));
    const right = await frameOf(page, child("after-load", 2, `${PORTRAIT}top.htm`));
    // 数える script は挿してある（写しの文書）。送り終えた後に、印が無いことを見る
    expect(await hasMarksScript(right)).toBe(true);
    await afterSent(page, right);
    expect(await marksBadge(page)).toBeNull();
    await page.browserContext().close();
  });

  it("記録した元の文書には数える script を挿さず、印も出さない", async () => {
    const page = await open("frame-snapshots", PORTRAIT);
    const right = await frameOf(page, `${PORTRAIT}top.htm`);
    expect(await textOf(right)).toContain("肖像のホームページ");
    expect(await hasMarksScript(right)).toBe(false);
    await afterSent(page, right);
    expect(await marksBadge(page)).toBeNull();
    await page.browserContext().close();
  });

  // CAPTURE-422 で、ダークモードの字が地と同じ白になって消えた。帯の印も字と地の色を決める
  it.each(["light", "dark"] as const)("%s モードでも、印の字は地と違う色", async (scheme) => {
    const page = await open("frame-snapshots", snapshot("after-behaviors", PORTRAIT), { scheme });
    const badge = await shownBadge(page);
    expect(badge.text).toBe("Script-added elements: 2");
    expect(badge.color).not.toBe(badge.background);
    await page.browserContext().close();
  });
});
