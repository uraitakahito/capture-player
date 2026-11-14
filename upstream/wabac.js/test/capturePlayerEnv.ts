// capture-player: 2026-11-14 に足した（CAPTURE-422）。撮った時の窓と DPR の読み方・文書の DPR の選び方・画面への知らせ。
import test from "ava";

import {
  buildEnvInsert,
  chooseDocumentDpr,
  getCaptureEnv,
  parseCaptureEnv,
  type WaczFileSource,
} from "../src/capturePlayerEnv";
import { selectRandomDocument } from "../src/capturePlayerRandom";

const pkg = (settings: unknown): Record<string, unknown> => ({
  profile: "data-package",
  "browserhive:capture": { settings },
});

test("settings の viewport と devicePixelRatios を読む", (t) => {
  t.deepEqual(
    parseCaptureEnv(pkg({ viewport: { width: 1280, height: 800 }, devicePixelRatios: [1] })),
    { width: 1280, height: 800, dprs: [1] },
  );
  t.deepEqual(
    parseCaptureEnv(pkg({ viewport: { width: 1000, height: 700 }, devicePixelRatios: [1, 2] })),
    { width: 1000, height: 700, dprs: [1, 2] },
  );
});

test("記録が無い・形が違うときは null（推し量らない）", (t) => {
  t.is(parseCaptureEnv({ profile: "data-package" }), null);
  t.is(parseCaptureEnv(pkg(undefined)), null);
  t.is(parseCaptureEnv(pkg({ devicePixelRatios: [1] })), null);
  t.is(parseCaptureEnv(pkg({ viewport: { width: 1280 }, devicePixelRatios: [1] })), null);
  t.is(parseCaptureEnv(pkg({ viewport: { width: 1280, height: 800 } })), null);
  t.is(parseCaptureEnv(pkg({ viewport: { width: 1280, height: 800 }, devicePixelRatios: [] })), null);
  t.is(parseCaptureEnv(pkg({ viewport: { width: "1280", height: 800 }, devicePixelRatios: [1] })), null);
  t.is(parseCaptureEnv(pkg({ viewport: { width: 0, height: 800 }, devicePixelRatios: [1] })), null);
  t.is(parseCaptureEnv(pkg({ viewport: { width: 1280, height: 800 }, devicePixelRatios: [1, 0] })), null);
  t.is(parseCaptureEnv(null), null);
});

const ENV = { width: 1280, height: 800, dprs: [1, 2] };

test("文書の DPR: レコードの pixelRatio → 乱数の控えの dpr → 最初の値", (t) => {
  t.is(chooseDocumentDpr(ENV, 3, 2), 3);
  t.is(chooseDocumentDpr(ENV, "1.5", 2), 1.5);
  t.is(chooseDocumentDpr(ENV, undefined, 2), 2);
  t.is(chooseDocumentDpr(ENV, null, null), 1);
  t.is(chooseDocumentDpr(ENV, "x", undefined), 1);
  t.is(chooseDocumentDpr(ENV, 0, undefined), 1);
});

test("乱数の控えの選んだ文書の行から dpr を拾う", (t) => {
  const lines = [
    { profile: "browserhive:random/1", kind: "document", document: 0, url: "https://a.test/", dpr: 1, date: "2026-11-14T00:00:00Z" },
    { profile: "browserhive:random/1", kind: "document", document: 1, url: "https://a.test/", dpr: 2, date: "2026-11-14T00:00:10Z" },
  ];
  t.is(selectRandomDocument(lines, "https://a.test/", new Date("2026-11-14T00:00:09Z"))?.dpr, 2);
  t.is(selectRandomDocument(lines, "https://a.test/", new Date("2026-11-14T00:00:01Z"))?.dpr, 1);
});

test("画面への知らせは __WB_top_frame へ bh-env を送る 1 行", (t) => {
  const out = buildEnvInsert({ width: 1280, height: 800, dprs: [1] }, 1);
  t.true(out.startsWith("<script>"));
  t.true(out.includes("window.__WB_top_frame"));
  const json = /postMessage\((\{.*?\}), /.exec(out)![1]!;
  t.deepEqual(JSON.parse(json), { wb_type: "bh-env", width: 1280, height: 800, dpr: 1, dprs: [1] });
  // 送り先が無ければ何もしない（再生の外で開かれた文書）
  const sent: unknown[] = [];
  const script = /<script>(.*)<\/script>/.exec(out)![1]!;
  new Function("window", script)({});
  new Function("window", script)({ __WB_top_frame: { postMessage: (m: unknown) => sent.push(m) } });
  t.deepEqual(sent, [{ wb_type: "bh-env", width: 1280, height: 800, dpr: 1, dprs: [1] }]);
});

test("datapackage.json は WACZ ごとに一度だけ読み、上限を超えたら使わない", async (t) => {
  let reads = 0;
  const files: Record<string, string> = {
    "a.wacz": JSON.stringify(pkg({ viewport: { width: 1280, height: 800 }, devicePixelRatios: [1] })),
    "big.wacz": " ".repeat(4 * 1024 * 1024 + 1),
  };
  const store: WaczFileSource = {
    waczfiles: {},
    loadFileFromNamedWACZ: (name: string) => {
      reads += 1;
      return Promise.resolve({
        reader: { readFully: () => Promise.resolve(new TextEncoder().encode(files[name] ?? "")) },
      });
    },
  };
  t.deepEqual(await getCaptureEnv(store, "a.wacz"), { width: 1280, height: 800, dprs: [1] });
  t.deepEqual(await getCaptureEnv(store, "a.wacz"), { width: 1280, height: 800, dprs: [1] });
  t.is(reads, 1);
  t.is(await getCaptureEnv(store, "big.wacz"), null);
});
