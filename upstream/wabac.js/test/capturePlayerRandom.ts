// capture-player: 2026-11-14 に足した（CAPTURE-378）。乱数の控えの行の選び方と、head に足す断片。
import test from "ava";

import {
  buildRandomInsert,
  callerFromStack,
  originalFromReplayUrl,
  parseRandomLines,
  selectRandomDocument,
} from "../src/capturePlayerRandom";

const P = "browserhive:random/1";
const doc = (document: number, url: string, date?: string): Record<string, unknown> => ({
  profile: P,
  kind: "document",
  document,
  url,
  frame: "main",
  dpr: 1,
  ...(date ? { record: `urn:uuid:${document}`, date } : {}),
});
const draw = (
  document: number,
  seq: number,
  caller: string,
  api: string,
  value?: unknown,
  bytes?: number,
): Record<string, unknown> => ({
  profile: P,
  kind: "draw",
  document,
  seq,
  api,
  caller,
  ...(bytes === undefined ? {} : { bytes }),
  ...(value === undefined ? {} : { value }),
});

const PICK = "https://fixtures.test/random/pick";
const JS = "https://fixtures.test/random/pick.js";

test("url の同じ文書のうち、date が応答の時刻にいちばん近い行を選ぶ", (t) => {
  const lines = [
    doc(0, PICK, "2026-11-14T02:10:00.757Z"),
    draw(0, 0, JS, "Math.random", 0.1),
    doc(1, PICK, "2026-11-14T02:20:00.100Z"),
    draw(1, 0, JS, "Math.random", 0.2),
  ];
  const second = selectRandomDocument(lines, PICK, new Date("2026-11-14T02:20:00Z"));
  t.is(second?.document, 1);
  t.deepEqual(second?.draws, { [`${JS}\nMath.random`]: [0.2] });

  const first = selectRandomDocument(lines, PICK, new Date("2026-11-14T02:10:00Z"));
  t.is(first?.document, 0);
});

test("fragment は比べない", (t) => {
  const lines = [doc(0, PICK, "2026-11-14T02:10:00Z")];
  t.is(selectRandomDocument(lines, `${PICK}#top`, new Date(0))?.document, 0);
});

test("url の違う文書しか無ければ選ばない", (t) => {
  const lines = [
    doc(0, "https://fixtures.test/random/other", "2026-11-14T02:10:00Z"),
    draw(0, 0, JS, "Math.random", 0.1),
  ];
  t.is(selectRandomDocument(lines, PICK, new Date()), null);
});

test("控えが無ければ選ばない", (t) => {
  t.is(selectRandomDocument([], PICK, new Date()), null);
  t.is(selectRandomDocument(parseRandomLines(""), PICK, new Date()), null);
});

test("date の無い行は、date のある行が無いときだけ使う", (t) => {
  const lines = [doc(0, PICK), doc(1, PICK, "2030-01-01T00:00:00Z")];
  t.is(selectRandomDocument(lines, PICK, new Date(0))?.document, 1);
  t.is(selectRandomDocument([doc(3, PICK)], PICK, new Date(0))?.document, 3);
});

test("値の無い行・合わない値は穴として残し、位置をずらさない", (t) => {
  const lines = [
    doc(0, PICK, "2026-11-14T02:10:00Z"),
    draw(0, 0, JS, "Math.random", 0.25),
    draw(0, 1, JS, "Math.random"),
    draw(0, 2, JS, "Math.random", 1.5),
    draw(0, 3, JS, "Math.random", 0.75),
    draw(0, 4, "", "crypto.getRandomValues", "q83vEg==", 4),
    draw(0, 5, "", "crypto.getRandomValues", "q83vEg==", 8),
    draw(0, 6, JS, "crypto.randomUUID", "3f2a9c1e-7b4d-4e8a-9f6c-0d1e2b3c4a5f"),
    draw(0, 7, JS, "crypto.randomUUID", "not-a-uuid"),
  ];
  const s = selectRandomDocument(lines, PICK, new Date(0));
  t.deepEqual(s?.draws, {
    [`${JS}\nMath.random`]: [0.25, null, null, 0.75],
    ["\ncrypto.getRandomValues"]: ["q83vEg==", null],
    [`${JS}\ncrypto.randomUUID`]: ["3f2a9c1e-7b4d-4e8a-9f6c-0d1e2b3c4a5f", null],
  });
  t.is(s?.recorded, 8);
});

test("他の文書の draw の行は混ぜない", (t) => {
  const lines = [
    doc(0, PICK, "2026-11-14T02:10:00Z"),
    doc(1, "https://fixtures.test/frame", "2026-11-14T02:10:00Z"),
    draw(1, 0, JS, "Math.random", 0.9),
    draw(0, 0, JS, "Math.random", 0.1),
  ];
  t.deepEqual(selectRandomDocument(lines, PICK, new Date(0))?.draws, {
    [`${JS}\nMath.random`]: [0.1],
  });
});

test("profile の違う行と読めない行は捨てる", (t) => {
  const text = [
    JSON.stringify(doc(0, PICK, "2026-11-14T02:10:00Z")),
    "{not json",
    JSON.stringify({ ...draw(0, 0, JS, "Math.random", 0.5), profile: "x" }),
    JSON.stringify(draw(0, 1, JS, "Math.random", 0.6)),
  ].join("\n");
  t.deepEqual(selectRandomDocument(parseRandomLines(text), PICK, new Date(0))?.draws, {
    [`${JS}\nMath.random`]: [0.6],
  });
});

test("選んだ行が無ければ断片は空", (t) => {
  t.is(buildRandomInsert(null, "/static/"), "");
});

test("返せる値が 1 つも無ければ断片は空", (t) => {
  const s = selectRandomDocument(
    [doc(0, PICK, "2026-11-14T02:10:00Z"), draw(0, 0, JS, "Math.random")],
    PICK,
    new Date(0),
  );
  t.not(s, null);
  t.is(buildRandomInsert(s, "/static/"), "");
});

test("断片は値を wbinfo.bh_random に置き、返す script を読む", (t) => {
  const s = selectRandomDocument(
    [doc(0, PICK, "2026-11-14T02:10:00Z"), draw(0, 0, JS, "Math.random", 0.5)],
    PICK,
    new Date(0),
  );
  const out = buildRandomInsert(s, "http://x/w/static/");
  t.true(out.startsWith("<script>wbinfo.bh_random = {"));
  t.true(out.includes("<script src='http://x/w/static/capturePlayerRandom.js'></script>"));
  const json = /wbinfo\.bh_random = (.*);<\/script>/.exec(out)![1]!;
  t.deepEqual(JSON.parse(json), {
    document: 0,
    recorded: 1,
    draws: { [`${JS}\nMath.random`]: [0.5] },
  });
});

test("断片の JSON は </script> と < で閉じない", (t) => {
  const evil = "https://fixtures.test/</script><script>alert(1)</script>";
  const s = selectRandomDocument(
    [
      doc(0, PICK, "2026-11-14T02:10:00Z"),
      draw(0, 0, evil, "Math.random", 0.5),
      draw(0, 1, "https://x/\u2028", "Math.random", 0.5),
    ],
    PICK,
    new Date(0),
  );
  const out = buildRandomInsert(s, "/static/");
  const inline = out.slice(0, out.indexOf("</script>"));
  t.false(inline.includes("<", 1));
  t.false(inline.includes("\u2028"));
  const json = /wbinfo\.bh_random = (.*);<\/script>/.exec(out)![1]!;
  t.true(
    Object.keys((JSON.parse(json) as { draws: Record<string, unknown> }).draws).includes(
      `${evil}\nMath.random`,
    ),
  );
});

const PREFIX = "http://127.0.0.1:9990/w/id-1/";
const STATIC = "http://127.0.0.1:9990/w/static/";
const back = (u: string) => originalFromReplayUrl(u, PREFIX);

test("再生の URL を記録の URL に戻す", (t) => {
  t.is(
    back(`${PREFIX}20261114021000js_/https://fixtures.test/random/pick.js`),
    "https://fixtures.test/random/pick.js",
  );
  t.is(back(`${PREFIX}mp_/https://a.test/?q=1`), "https://a.test/?q=1");
  t.is(back("http://other.test/a.js"), null);
});

test("呼び手は、wombat と自分の枠を飛ばした、いちばん内側の http(s) の枠（Chrome の形）", (t) => {
  const stack = [
    "Error",
    `    at nextValue (${STATIC}capturePlayerRandom.js:1:200)`,
    `    at Math.random (${STATIC}capturePlayerRandom.js:1:300)`,
    `    at Function.call (${STATIC}wombat.js:1:400)`,
    `    at pick (${PREFIX}20261114021000js_/https://fixtures.test/random/pick.js#x:3:10)`,
    `    at ${PREFIX}20261114021000mp_/https://fixtures.test/random/pick:12:5`,
  ].join("\n");
  t.is(callerFromStack(stack, STATIC, back), "https://fixtures.test/random/pick.js");
});

test("呼び手は Firefox・Safari の形でも読める", (t) => {
  const stack = [
    `random@${STATIC}capturePlayerRandom.js:1:300`,
    `@${PREFIX}20261114021000js_/https://fixtures.test/random/pick.js:3:10`,
  ].join("\n");
  t.is(callerFromStack(stack, STATIC, back), "https://fixtures.test/random/pick.js");
});

test("http(s) の枠が無ければ呼び手は空", (t) => {
  const stack = [
    "Error",
    `    at random (${STATIC}capturePlayerRandom.js:1:300)`,
    "    at <anonymous>:1:1",
  ].join("\n");
  t.is(callerFromStack(stack, STATIC, back), "");
});
