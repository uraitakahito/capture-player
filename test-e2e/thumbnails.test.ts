// 頁の一覧の絵（CAPTURE-440）。見本は test-e2e/fixtures/README.md の「頁の一覧の絵」。
//
// BrowserHive の WACZ に上流の絵（urn:thumbnail:<頁の url>）は無く、節目のスクリーンショット
// （urn:browserhive:screenshot:<時点>:<文書の URL>・WebP・1280×800）が在る。上流の一覧は urn:thumbnail: だけを
// 引くので、BrowserHive の WACZ では絵が出ない。どの絵が出たかは、頁の中で絵のバイト列の SHA-256 を取り、
// 見本の索引の digest と一致を確かめた値と照らす（値は試験に書き込む）。
import type { Server } from "node:http";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Browser, Page } from "puppeteer-core";

import type { RunningViewer } from "../src/run.js";
import { launch, startFixtures, startViewer, waitFor } from "./helpers.js";

/** 見本の絵の SHA-256 */
const SHOT = {
  /** with-screenshots.wacz の after-load（検索の前） */
  searchAfterLoad: "fcce557a46dcbd1e26c2a051683605e0541fa241089a4a24685621554480fca9",
  /** with-screenshots.wacz の after-behaviors（検索の後。URL も after-load と違う） */
  searchAfterBehaviors: "86360faa749704ecbc286954ab02fc85a1ab0ed8e8ea1876e4e695d609ad80dd",
  /** random-pick.wacz の after-load（thumbnail-only.wacz・bucket/thumbnails/pick.wacz も同じ絵） */
  pick: "bddf0ec8bb2eca976db21351cb714b80e008e8c8a20e30c6aac9fb59f47c5a0b",
  /** random-twice.wacz の after-load（bucket/thumbnails/twice.wacz も同じ絵） */
  twice: "26d77a4f989125f9357a28ae4b6828adf0c9ff3facd3c05d3e7edfa69c8448a1",
} as const;

/** 同じ URL を 2 回撮った 2 本の合本（pick・twice） */
const SAME_URL = "org/test/crawls/00000000-0000-4000-8000-000000000440/r1";
/** 同じ URL の、絵の在る回（twice）と無い回（pick-no-shot）の合本 */
const ONE_WITHOUT = "org/test/crawls/00000000-0000-4000-8000-000000000441/r1";

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

/** 見本 1 本（`<名前>.wacz`）か合本（`/wacz/<置き場>/replay.json`）の頁の一覧を、新しい profile で開く */
const openList = async (source: string): Promise<Page> => {
  const context = await browser.createBrowserContext();
  const page = await context.newPage();
  await page.setViewport({ width: 1200, height: 900 });
  const src = source.startsWith("/") ? source : `${base}/${source}`;
  await page.goto(`${origin}/?source=${encodeURIComponent(src)}#view=pages`);
  return page;
};

const bundle = (place: string): string => `/wacz/${place}/replay.json`;

/** 一覧の 1 行の絵の様子 */
interface Row {
  title: string;
  /** 行の絵（img.thumbnail）。無ければ null */
  image: {
    complete: boolean;
    width: number;
    height: number;
    sha256: string | null;
    objectFit: string;
    objectPosition: string;
  } | null;
  /** 絵の代わりの箱（favicon か「No image」） */
  placeholder: boolean;
}

/** 一覧の行（wr-page-entry）を上から順に読む。読めた絵はバイト列の SHA-256 を取る */
const readRows = (page: Page): Promise<Row[]> =>
  page.evaluate(async () => {
    const entries: Element[] = [];
    const walk = (root: Document | ShadowRoot): void => {
      for (const el of root.querySelectorAll("*")) {
        if (el.localName === "wr-page-entry") entries.push(el);
        if (el.shadowRoot) walk(el.shadowRoot);
      }
    };
    walk(document);
    const hex = (buf: ArrayBuffer): string =>
      [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
    return Promise.all(
      entries.map(async (entry) => {
        const root = entry.shadowRoot;
        const title = (root?.querySelector(".page-title")?.textContent ?? "")
          .replace(/\s+/g, " ")
          .trim();
        const img = root?.querySelector<HTMLImageElement>("img.thumbnail") ?? null;
        let image: Row["image"] = null;
        if (img) {
          const loaded = img.complete && img.naturalWidth > 0;
          const style = getComputedStyle(img);
          image = {
            complete: img.complete,
            width: img.naturalWidth,
            height: img.naturalHeight,
            sha256: loaded
              ? hex(
                  await crypto.subtle.digest(
                    "SHA-256",
                    await (await fetch(img.currentSrc)).arrayBuffer(),
                  ),
                )
              : null,
            objectFit: style.objectFit,
            objectPosition: style.objectPosition,
          };
        }
        return { title, image, placeholder: root?.querySelector(".thumbnail-placeholder") != null };
      }),
    );
  });

/**
 * 行が `count` 個あり、どの行の絵も読み終わる（読めたか、代わりの箱になったか、壊れたまま止まったか）まで待ち、
 * 2 度続けて同じだった様子を返す（候補を替える途中を拾わない）。
 */
const settledRows = async (page: Page, count: number): Promise<Row[]> => {
  let last = "";
  return waitFor(
    async () => {
      const rows = await readRows(page);
      if (rows.length !== count || rows.some((r) => r.image !== null && !r.image.complete)) {
        last = "";
        return undefined;
      }
      const now = JSON.stringify(rows);
      if (now !== last) {
        last = now;
        return undefined;
      }
      return rows;
    },
    `一覧の ${String(count)} 行の絵`,
  );
};

const rowOf = (rows: Row[], title: string): Row => {
  const row = rows.find((r) => r.title === title);
  if (row === undefined)
    throw new Error(`「${title}」の行が無い: ${rows.map((r) => r.title).join(" / ")}`);
  return row;
};

/** 絵の無い行の、今までどおりの見え方（壊れた img は残さず、代わりの箱） */
const expectNoImage = (row: Row): void => {
  expect(row.image).toBeNull();
  expect(row.placeholder).toBe(true);
};

describe("BrowserHive の節目のスクリーンショット", () => {
  it("文書の行は after-load の絵を出す", async () => {
    const page = await openList("with-screenshots.wacz");
    const row = rowOf(await settledRows(page, 3), "search");
    expect(row.image).toMatchObject({ width: 1280, height: 800, sha256: SHOT.searchAfterLoad });
    await page.browserContext().close();
  });

  it("写しの行は同じ時点の絵を出す", async () => {
    const page = await openList("with-screenshots.wacz");
    const rows = await settledRows(page, 3);
    expect(rowOf(rows, "Snapshot after load: search").image?.sha256).toBe(SHOT.searchAfterLoad);
    expect(rowOf(rows, "Snapshot after scripts: search").image?.sha256).toBe(
      SHOT.searchAfterBehaviors,
    );
    await page.browserContext().close();
  });

  it("絵は歪めず、箱（16:9）に合わせて上を揃えて切る", async () => {
    const page = await openList("with-screenshots.wacz");
    const row = rowOf(await settledRows(page, 3), "search");
    expect(row.image).toMatchObject({ objectFit: "cover", objectPosition: "50% 0%" });
    await page.browserContext().close();
  });
});

describe("絵の無い WACZ", () => {
  it.each([
    [
      "without-screenshots-secret.wacz（シークレットで絵を残さなかった）",
      "without-screenshots-secret.wacz",
      3,
    ],
    ["without-screenshots-withheld.wacz（文書を伏せた）", "without-screenshots-withheld.wacz", 1],
    ["snapshots.wacz（絵の欄が無い BrowserHive）", "snapshots.wacz", 3],
  ])("%s は今までどおりの代わりの箱で、壊れた絵を残さない", async (_label, name, count) => {
    const page = await openList(name);
    const rows = await settledRows(page, count);
    for (const row of rows) expectNoImage(row);
    await page.browserContext().close();
  });
});

describe("上流の名前の絵（urn:thumbnail:）", () => {
  it("urn:thumbnail: の絵だけを持つ WACZ では、文書の行にそれを出す", async () => {
    const page = await openList("thumbnail-only.wacz");
    const rows = await settledRows(page, 2);
    expect(rowOf(rows, "pick 960463").image).toMatchObject({
      width: 1280,
      height: 800,
      sha256: SHOT.pick,
    });
    // 写しの行は、同じ時点の BrowserHive の絵だけを引く（上流の名前は引かない）
    expectNoImage(rowOf(rows, "Snapshot after load: pick 960463"));
    await page.browserContext().close();
  });
});

describe("合本", () => {
  it("同じ URL を 2 回撮った 2 本は、それぞれの回の絵を出す（読み直しても）", async () => {
    const page = await openList(bundle(SAME_URL));
    for (const pass of ["最初", "読み直し"]) {
      const rows = await settledRows(page, 2);
      expect(rowOf(rows, "pick 960463").image?.sha256, pass).toBe(SHOT.pick);
      expect(rowOf(rows, "pick 871005").image?.sha256, pass).toBe(SHOT.twice);
      // 読み直すと、2 本の索引が両方とも IndexedDB に在る所から引く
      await page.reload();
    }
    await page.browserContext().close();
  });

  it("同じ URL の絵の無い回の行に、別の回の絵を出さない（読み直しても）", async () => {
    const page = await openList(bundle(ONE_WITHOUT));
    for (const pass of ["最初", "読み直し"]) {
      const rows = await settledRows(page, 2);
      expect(rowOf(rows, "pick 871005").image?.sha256, pass).toBe(SHOT.twice);
      expectNoImage(rowOf(rows, "pick 960463"));
      await page.reload();
    }
    await page.browserContext().close();
  });
});

describe("行の要素の使い回し", () => {
  // 一覧は行の要素を使い回す（並べ替えると、要素はそのままで頁が替わる）。見本は、文書の行が 2 番目の候補
  // （urn:thumbnail:）で絵を出し、写しの行は候補が尽きて代わりの箱になる WACZ。
  it("並べ替えても、絵は自分の行に付いてくる", async () => {
    const page = await openList("thumbnail-only.wacz");
    const before = await settledRows(page, 2);
    // 一覧の日付の見出しを押す（既定は新しい順。押すと古い順）
    const clicked = await page.evaluate(() => {
      const walk = (root: Document | ShadowRoot): HTMLElement | null => {
        const found = root.querySelector<HTMLElement>("a[data-key='date']");
        if (found) return found;
        for (const el of root.querySelectorAll("*")) {
          const inner = el.shadowRoot ? walk(el.shadowRoot) : null;
          if (inner) return inner;
        }
        return null;
      };
      const link = walk(document);
      link?.click();
      return link !== null;
    });
    expect(clicked).toBe(true);
    const after = await waitFor(async () => {
      const rows = await settledRows(page, 2);
      return rows[0]?.title === before[1]?.title ? rows : undefined;
    }, "逆の並び");
    expect(after.map((r) => r.title)).toEqual(before.map((r) => r.title).reverse());
    for (const rows of [before, after]) {
      expect(rowOf(rows, "pick 960463").image?.sha256).toBe(SHOT.pick);
      expectNoImage(rowOf(rows, "Snapshot after load: pick 960463"));
    }
    await page.browserContext().close();
  });
});
