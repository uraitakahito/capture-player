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
