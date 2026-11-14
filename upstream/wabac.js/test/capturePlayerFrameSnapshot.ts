// capture-player: 2026-11-15 に足した（CAPTURE-147）。BrowserHive の写しの文書の枠を子の写しで開く書き換えと、
// スクリプトが足した要素を数える挿し込み。
import test from "ava";

import { doRewrite } from "./helpers/index.js";
import {
  frameSnapshotTarget,
  isBrowserHiveSnapshot,
  SCRIPT_MARKS_INSERT,
} from "../src/capturePlayerSnapshot";

const PREFIX = "http://localhost:8080/prefix/20201226101010";
const SNAPSHOT = "urn:browserhive:snapshot:after-load:https://example.com/portrait/";
const FRAME_SNAPSHOT = "urn:browserhive:frame-snapshot:after-load:1:https://example.com/portrait/menu.htm";
const CHILD_TOP = "urn:browserhive:frame-snapshot:after-load:2:https://example.com/portrait/top.htm";

/** BrowserHive の写しと同じく <base> を持つ文書を、url の記録として書き換えた body */
const rewrite = async (url: string, body: string): Promise<string> => {
  const { text } = await doRewrite({
    content: `<html><head><base href="https://example.com/portrait/"></head>${body}</html>`,
    contentType: "text/html; charset=UTF-8",
    url,
    useBaseRules: false,
  });
  return text;
};

test("写しの文書の frame は、data-browserhive-snapshot の子の写しの再生の URL で開く", async (t) => {
  const text = await rewrite(
    SNAPSHOT,
    `<frameset cols="18,82"><frame src="menu.htm" name="left" data-browserhive-snapshot="${FRAME_SNAPSHOT}"><frame src="top.htm" name="right" data-browserhive-snapshot="${CHILD_TOP}"></frameset>`,
  );
  t.true(text.includes(`<frame src="${PREFIX}fr_/${FRAME_SNAPSHOT}" name="left" data-browserhive-snapshot="${FRAME_SNAPSHOT}">`), text);
  t.true(text.includes(`<frame src="${PREFIX}fr_/${CHILD_TOP}" name="right" data-browserhive-snapshot="${CHILD_TOP}">`), text);
});

test("子の写しの文書の中の枠（入れ子）も、iframe も同じに開く", async (t) => {
  const inner = "urn:browserhive:frame-snapshot:after-behaviors:3:https://example.com/links/frame/empty";
  const text = await rewrite(
    FRAME_SNAPSHOT,
    `<body><iframe src="/links/frame/empty" data-browserhive-snapshot="${inner}"></iframe></body>`,
  );
  t.true(text.includes(`<iframe src="${PREFIX}if_/${inner}" data-browserhive-snapshot="${inner}">`), text);
});

test("記録した元の文書（写しでない）の枠は、属性が在っても元の src で開く", async (t) => {
  const text = await rewrite(
    "https://example.com/portrait/",
    `<frameset><frame src="https://example.com/portrait/menu.htm" data-browserhive-snapshot="${FRAME_SNAPSHOT}"></frameset>`,
  );
  t.true(text.includes(`<frame src="${PREFIX}fr_/https://example.com/portrait/menu.htm" data-browserhive-snapshot="${FRAME_SNAPSHOT}">`), text);
});

test("属性の値が子の写しの URI でなければ、元の src で開く", async (t) => {
  for (const value of [
    "urn:browserhive:snapshot:after-load:https://example.com/portrait/menu.htm",
    "https://example.com/other.htm",
    "",
  ]) {
    const text = await rewrite(SNAPSHOT, `<frameset><frame src="https://example.com/portrait/menu.htm" data-browserhive-snapshot="${value}"></frameset>`);
    t.true(text.includes(`<frame src="${PREFIX}fr_/https://example.com/portrait/menu.htm"`), `${value}: ${text}`);
    t.false(text.includes(`fr_/urn:`), value);
  }
});

test("枠でない要素の属性では src を替えない", async (t) => {
  const text = await rewrite(SNAPSHOT, `<body><img src="https://example.com/portrait/mona.jpg" data-browserhive-snapshot="${FRAME_SNAPSHOT}"></body>`);
  t.true(text.includes(`<img src="${PREFIX}im_/https://example.com/portrait/mona.jpg"`), text);
});

test("escape された属性の値は、解いた URI で開き、書き出すときに escape し直す", async (t) => {
  const uri = 'urn:browserhive:frame-snapshot:after-load:1:https://example.com/a?x=1&y="2"';
  const escaped = uri.replace(/&/g, "&amp;").replace(/"/g, "&quot;");
  const text = await rewrite(SNAPSHOT, `<frameset><frame src="a?x=1&amp;y=2" data-browserhive-snapshot="${escaped}"></frameset>`);
  // & は解いて URL に入り、書き出しで &amp; に戻る。" は URL として %22 になる。属性はそのまま残る
  const src = `${PREFIX}fr_/urn:browserhive:frame-snapshot:after-load:1:https://example.com/a?x=1&amp;y=%222%22`;
  t.true(text.includes(`<frame src="${src}" data-browserhive-snapshot="${escaped}">`), text);
  // 属性の外へ出る " は無い
  t.false(text.includes('y="2"'), text);
});

test("src の無い枠にも、子の写しの src を足す", async (t) => {
  const text = await rewrite(SNAPSHOT, `<frameset><frame name="x" data-browserhive-snapshot="${FRAME_SNAPSHOT}"></frameset>`);
  t.true(text.includes(`<frame name="x" data-browserhive-snapshot="${FRAME_SNAPSHOT}" src="${PREFIX}fr_/${FRAME_SNAPSHOT}">`), text);
});

test("写しかどうかは記録の URI の頭で決める", (t) => {
  t.true(isBrowserHiveSnapshot(SNAPSHOT));
  t.true(isBrowserHiveSnapshot(FRAME_SNAPSHOT));
  t.false(isBrowserHiveSnapshot("https://example.com/portrait/"));
  t.false(isBrowserHiveSnapshot("urn:browserhive:screenshot:after-load:https://example.com/"));
  t.is(frameSnapshotTarget(SNAPSHOT, "frame", [{ name: "data-browserhive-snapshot", value: FRAME_SNAPSHOT }]), FRAME_SNAPSHOT);
  t.is(frameSnapshotTarget(SNAPSHOT, "div", [{ name: "data-browserhive-snapshot", value: FRAME_SNAPSHOT }]), null);
  t.is(frameSnapshotTarget(SNAPSHOT, "iframe", []), null);
});

test("数える挿し込みは、文書の [data-capture-script] を id ごとに数えて bh-script-marks で送る", (t) => {
  const sent: unknown[] = [];
  const els = ["marker", "marker", "menu-marker", "__proto__", null].map((v) => ({
    getAttribute: () => v,
  }));
  const fakeWindow = {
    __WB_top_frame: { postMessage: (m: unknown) => sent.push(m) },
    wbinfo: { top_host: "http://localhost:8080" },
  };
  const fakeDocument = {
    readyState: "interactive",
    querySelectorAll: (sel: string) => (sel === "[data-capture-script]" ? els : []),
    addEventListener: () => undefined,
  };
  const body = /<script>([\s\S]*)<\/script>/.exec(SCRIPT_MARKS_INSERT)?.[1] ?? "";
  // eslint-disable-next-line @typescript-eslint/no-implied-eval
  new Function("window", "document", body)(fakeWindow, fakeDocument);
  t.is(sent.length, 1);
  const m = sent[0] as { wb_type: string; count: number; byId: Record<string, number> };
  t.is(m.wb_type, "bh-script-marks");
  t.is(m.count, 5);
  t.deepEqual({ ...m.byId }, { marker: 2, "menu-marker": 1, ["__proto__"]: 1, "": 1 });
});
