// build したビューアで、capture-player の直しが BrowserHive の WACZ に効いているかを見る。
// 見本は test-e2e/fixtures/README.md。
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Server } from "node:http";
import type { Browser, Page } from "puppeteer-core";

import type { RunningViewer } from "../src/run.js";
import {
  deepText,
  launch,
  signatureMatched,
  startFixtures,
  startViewer,
  waitFor,
} from "./helpers.js";

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

/** 新しい profile で、見本を ?source= で開く */
const open = async (name: string, hash: string): Promise<Page> => {
  const context = await browser.createBrowserContext();
  const page = await context.newPage();
  await page.setViewport({ width: 1200, height: 900 });
  await page.goto(`${origin}/?source=${encodeURIComponent(`${base}/${name}.wacz`)}#${hash}`);
  return page;
};

describe("署名", () => {
  it("wacz-signer の DER の署名を照合できる", async () => {
    const page = await open("signed-der", "view=pages");
    expect(await waitFor(() => signatureMatched(page), "署名の照合")).toBe(true);
  });

  it("1 ビット変えた署名は照合に落ち、invalid に数える", async () => {
    const page = await open("signed-tampered", "view=pages");
    expect(await waitFor(() => signatureMatched(page), "署名の照合")).toBe(false);
    const text = await waitFor(async () => {
      const t = await deepText(page);
      return /\d+ hashes verified/.test(t) ? t : undefined;
    }, "Archive Info の数");
    expect(text).toMatch(/0 hashes verified, 2 invalid/);
  });
});

describe("写しの時点の題", () => {
  it("写しの行は題に時点を添え、URL の欄に元の文書の URL を出す", async () => {
    const page = await open("snapshots", "view=pages");
    const text = await waitFor(async () => {
      const t = await deepText(page);
      return t.includes("Snapshot after load") ? t : undefined;
    }, "写しの行");
    expect(text).toContain("Snapshot after load: ok");
    expect(text).toContain("Snapshot after scripts: ok");
    expect(text).not.toContain("urn:browserhive:snapshot:");
  });
});

describe("本文を残さなかった文書", () => {
  it("WARC-Truncated の文書は、白い頁でなく知らせと理由を出す", async () => {
    const url = "http://capture-fixtures-2-a.browserhive:8080/redirect-target";
    const page = await open(
      "truncated-document",
      new URLSearchParams({ view: "replay", url, ts: "20261111141833" }).toString(),
    );
    const text = await waitFor(async () => {
      const frame = page.frames().find((f) => f.url().includes("mp_/"));
      if (!frame) return undefined;
      const body = await frame.evaluate(() => document.body.innerText).catch(() => "");
      return body.includes("did not keep") ? body : undefined;
    }, "知らせの頁");
    expect(text).toContain("WARC-Truncated: length");
    expect(text).toContain("not part of the archived page");
  });
});

describe("Archive Info の BrowserHive の欄", () => {
  const infoText = async (name: string): Promise<string> => {
    const page = await open(name, "view=pages");
    return waitFor(async () => {
      const t = await deepText(page);
      return /\d+ hashes verified|Validation/.test(t) ? t : undefined;
    }, "Archive Info");
  };

  it("欠けた本文の数と例を出す", async () => {
    const text = await infoText("truncated-document");
    expect(text).toContain("Incomplete: 1 body truncated");
    expect(text).toContain("http://capture-fixtures-2-a.browserhive:8080/redirect-target");
    expect(text).toContain("this viewer does not stop it");
  });

  it("欠けの無い WACZ は完全と言い、写しの時点と文書を出す", async () => {
    const text = await infoText("snapshots");
    expect(text).toContain("Complete: every response body was kept");
    expect(text).toContain("Snapshots: after-load, after-behaviors");
    expect(text).toContain("Captured with BrowserHive 29.0.0 (cb0a278)");
  });

  it("署名の無い WACZ は、署名を有効にも無効にも数えず not signed と言う", async () => {
    const text = await infoText("snapshots");
    expect(text).toMatch(/0 hashes verified, 1 invalid, not signed/);
  });

  it("browserhive:capture の無い WACZ には欄を出さない", async () => {
    const text = await infoText("no-browserhive");
    expect(text).not.toContain("Captured with BrowserHive");
    expect(text).not.toContain("Complete: every response body");
  });
});
