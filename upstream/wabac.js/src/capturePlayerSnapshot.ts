// capture-player: 2026-11-15 に足した（CAPTURE-147）。BrowserHive の DOM の写しを再生するときの 2 つの直し。
//
// 1. 子の写し（BrowserHive WARC Profile 1.5.0 の #frame-snapshots・#frame-snapshot-references、
//    BrowserHive WACZ Profile 1.27.0 の #snapshot-frames）: 写しの文書の中の枠の要素は、`src` を元のまま残し、
//    子の写しの URI を `data-browserhive-snapshot` に持つ。素の ReplayWeb.page は属性を読まず、枠に記録した元の
//    文書を出す。capture-player は、写しの文書の枠を子の写しで開く（rewrite/html.ts が使う）。
// 2. スクリプトが足した要素の数: 写しの文書（主・子とも）にだけ小さな inline script を挿し、
//    `[data-capture-script]` の要素を数えて再生の UI へ送る（collection.ts の makeHeadInsert が挿す）。

/** 主フレームの写し（`urn:browserhive:snapshot:<時点>:<文書の URL>`） */
export const SNAPSHOT_PREFIX = "urn:browserhive:snapshot:";
/** 子フレームの写し（`urn:browserhive:frame-snapshot:<時点>:<番号>:<子の文書の URL>`） */
export const FRAME_SNAPSHOT_PREFIX = "urn:browserhive:frame-snapshot:";
/** 親の写しの枠の要素が子の写しを名指す属性 */
export const FRAME_SNAPSHOT_ATTR = "data-browserhive-snapshot";
/** capture-scripts のスクリプトが、頁に足した要素に付ける属性（値はスクリプトの id） */
export const SCRIPT_MARK_ATTR = "data-capture-script";

/** その URL の記録が BrowserHive の DOM の写し（主か子）か */
export function isBrowserHiveSnapshot(url: string): boolean {
  return url.startsWith(SNAPSHOT_PREFIX) || url.startsWith(FRAME_SNAPSHOT_PREFIX);
}

/**
 * 写しの文書の枠の要素（frame・iframe）を、どの子の写しで開くか。写しでない文書・枠でない要素・
 * 属性が無いか子の写しの URI でない値は null（元の src のまま書き換える）。
 */
export function frameSnapshotTarget(
  documentUrl: string,
  tagName: string,
  attrs: readonly { name: string; value: string }[],
): string | null {
  if (!isBrowserHiveSnapshot(documentUrl)) {
    return null;
  }
  if (tagName !== "frame" && tagName !== "iframe") {
    return null;
  }
  const value = attrs.find((a) => a.name === FRAME_SNAPSHOT_ATTR)?.value;
  return value?.startsWith(FRAME_SNAPSHOT_PREFIX) ? value : null;
}

/** 再生の UI へ送る数（`wb_type: "bh-script-marks"`） */
export type ScriptMarksMessage = {
  wb_type: "bh-script-marks";
  /** `[data-capture-script]` の要素の数（この文書の中だけ。枠の中の文書はそれぞれが送る） */
  count: number;
  /** 属性の値（スクリプトの id）ごとの数 */
  byId: Record<string, number>;
};

/**
 * 写しの文書の head に挿す script。DOMContentLoaded で、この文書の `[data-capture-script]` を数えて送る
 * （0 でも送る。UI は窓ごとに持ち、文書が替わった窓の数を捨てて足す）。写しは頁の script を持たないので、
 * 数えた後に要素は増えない。
 */
export const SCRIPT_MARKS_INSERT = `<script>(function () {
  var send = function () {
    var top = window.__WB_top_frame;
    if (!top) { return; }
    // 鍵は頁が決める字なので、prototype の無い object に数える（"__proto__" も 1 つの id）
    var byId = Object.create(null);
    var els = document.querySelectorAll("[${SCRIPT_MARK_ATTR}]");
    for (var i = 0; i < els.length; i++) {
      var id = els[i].getAttribute("${SCRIPT_MARK_ATTR}") || "";
      byId[id] = (byId[id] || 0) + 1;
    }
    top.postMessage({ wb_type: "bh-script-marks", count: els.length, byId: byId }, (window.wbinfo && window.wbinfo.top_host) || "*");
  };
  if (document.readyState === "loading") { document.addEventListener("DOMContentLoaded", send); } else { send(); }
})();</script>
`;
