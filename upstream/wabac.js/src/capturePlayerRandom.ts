// capture-player: 2026-11-14 に足した（CAPTURE-378）。BrowserHive WACZ Profile 1.26.0 の乱数の控え
// （`random/values.jsonl`）を読み、再生する文書の行を選び、頁に渡す挿し込みを組む。
// 仕様: https://uraitakahito.github.io/browserhive-specs/wacz-profile/1.26.0/#random-reading
//
// ここは純粋な関数と、WACZ から控えを読む関数だけ。頁の中で値を返すのは rewrite/capturePlayerRandomInject.ts。
// 頁の中の側もこのファイルの関数（callerFromStack）を使うので、重い物を import しない。
// `random/recorder.js` は読まず、走らせない（仕様が禁じる）。

export const RANDOM_VALUES_PATH = "random/values.jsonl";
export const RANDOM_PROFILE = "browserhive:random/1";
/** これより大きい控えは読まない（再生の一回ごとに文書へ渡すので、大きな物は頁を重くする） */
export const RANDOM_MAX_BYTES = 4 * 1024 * 1024;

export type RandomApi = "Math.random" | "crypto.getRandomValues" | "crypto.randomUUID";

const APIS: readonly string[] = ["Math.random", "crypto.getRandomValues", "crypto.randomUUID"];

/** 文書に渡す値。`null` は「呼ばれたが値を残さなかった／使えない」行（穴）。穴も数えて位置を保つ */
export type RandomValue = number | string | null;

export type RandomSelection = {
  /** 選んだ文書の行の document */
  document: number;
  /** 鍵は `${caller}\n${api}`。n 番目が、その呼び手のその関数の n 回目の呼び出しの値 */
  draws: Record<string, RandomValue[]>;
  /** 選んだ文書の draw の行の数（値の無い行も含む） */
  recorded: number;
};

type Line = Record<string, unknown>;

/** JSON Lines を読む。読めない行・profile の違う行は捨てる */
export function parseRandomLines(text: string): Line[] {
  const lines: Line[] = [];
  for (const raw of text.split("\n")) {
    const s = raw.trim();
    if (!s) {
      continue;
    }
    try {
      const v: unknown = JSON.parse(s);
      if (
        v &&
        typeof v === "object" &&
        !Array.isArray(v) &&
        (v as Line)["profile"] === RANDOM_PROFILE
      ) {
        lines.push(v as Line);
      }
    } catch (_) {
      // 読めない行は使わない
    }
  }
  return lines;
}

/** document の行の url と同じ形にする: fragment を除き、data: は最初のコンマまで */
export function documentKeyUrl(url: string): string {
  if (url.startsWith("data:")) {
    const comma = url.indexOf(",");
    return comma < 0 ? url : url.slice(0, comma + 1);
  }
  const hash = url.indexOf("#");
  return hash < 0 ? url : url.slice(0, hash);
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const BASE64_RE = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;

function base64Length(s: string): number {
  if (!BASE64_RE.test(s)) {
    return -1;
  }
  const pad = s.endsWith("==") ? 2 : s.endsWith("=") ? 1 : 0;
  return (s.length / 4) * 3 - pad;
}

/** draw の行の値を、その関数に返せる形で。返せない物は null（穴） */
function drawValue(line: Line): RandomValue {
  const value = line["value"];
  switch (line["api"]) {
    case "Math.random":
      return typeof value === "number" && value >= 0 && value < 1 ? value : null;
    case "crypto.randomUUID":
      return typeof value === "string" && UUID_RE.test(value) ? value : null;
    case "crypto.getRandomValues":
      return typeof value === "string" &&
        typeof line["bytes"] === "number" &&
        base64Length(value) === line["bytes"]
        ? value
        : null;
    default:
      return null;
  }
}

/**
 * 再生する文書の行を選ぶ。url の同じ document の行のうち、date が応答の時刻にいちばん近い物（同じ近さなら
 * 先の行）。date のある行が 1 つも無いときだけ、date の無い行（の最初）を使う。無ければ null。
 * frame・dpr・record は見ない（再生の側に、比べられる確かな値が無い）。
 */
export function selectRandomDocument(
  lines: Line[],
  url: string,
  date: Date,
): RandomSelection | null {
  const target = documentKeyUrl(url);
  const when = date.getTime();
  const seen = new Set<number>();
  let best: { document: number; distance: number } | null = null;
  let undated: number | null = null;

  for (const line of lines) {
    if (line["kind"] !== "document") {
      continue;
    }
    const doc = line["document"];
    if (typeof doc !== "number" || !Number.isInteger(doc) || seen.has(doc)) {
      continue;
    }
    seen.add(doc);
    if (line["url"] !== target) {
      continue;
    }
    const lineDate = typeof line["date"] === "string" ? Date.parse(line["date"]) : NaN;
    if (Number.isNaN(lineDate)) {
      if (undated === null) {
        undated = doc;
      }
      continue;
    }
    const distance = Math.abs(lineDate - when);
    if (!best || distance < best.distance) {
      best = { document: doc, distance };
    }
  }

  const chosen = best ? best.document : undated;
  if (chosen === null) {
    return null;
  }

  const rows: { seq: number; key: string; value: RandomValue }[] = [];
  for (const line of lines) {
    if (line["kind"] !== "draw" || line["document"] !== chosen) {
      continue;
    }
    const api = line["api"];
    const caller = line["caller"];
    const seq = line["seq"];
    if (
      typeof api !== "string" ||
      !APIS.includes(api) ||
      typeof caller !== "string" ||
      typeof seq !== "number"
    ) {
      continue;
    }
    rows.push({ seq, key: `${caller}\n${api}`, value: drawValue(line) });
  }
  // 行は seq の順に並ぶ決まり。崩れていても seq の順で数える
  rows.sort((a, b) => a.seq - b.seq);

  const draws: Record<string, RandomValue[]> = {};
  for (const { key, value } of rows) {
    (draws[key] ??= []).push(value);
  }
  return { document: chosen, draws, recorded: rows.length };
}

/** 返せる値が 1 つでもあるか */
export function hasUsableValue(selection: RandomSelection | null): boolean {
  if (!selection) {
    return false;
  }
  return Object.values(selection.draws).some((list) => list.some((v) => v !== null));
}

/** 頁の <script> の中に置いても閉じない JSON */
function scriptSafeJSON(value: unknown): string {
  return JSON.stringify(value)
    .replace(/</g, "\\u003c")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
}

/**
 * head の挿し込みに足す断片。返せる値が無ければ空（挿し込みは改変前とバイトまで同じになる）。
 * wombat の初期化（_WBWombatInit）の後に置く。値を返す script は wombat の Math.random を控えて差し替えるため。
 */
export function buildRandomInsert(selection: RandomSelection | null, staticPrefix: string): string {
  if (!selection || !hasUsableValue(selection)) {
    return "";
  }
  const data = {
    document: selection.document,
    recorded: selection.recorded,
    draws: selection.draws,
  };
  return `<script>wbinfo.bh_random = ${scriptSafeJSON(data)};</script>
<script src='${staticPrefix}capturePlayerRandom.js'></script>
`;
}

// ===========================================================================
// 頁の中の側（rewrite/capturePlayerRandomInject.ts）が使う

/**
 * `new Error().stack` の文字から、呼んだ JS の URL（記録の URL・fragment なし）を探す。
 * いちばん内側の、http(s) の URL を持つ枠。`skipPrefix` の下（wombat と、値を返す script）は数えない。
 * 再生の URL は `toOriginal` で記録の URL に戻す。戻せない物（記録の URL でない）は飛ばす。無ければ空。
 */
export function callerFromStack(
  stack: string,
  skipPrefix: string,
  toOriginal: (url: string) => string | null,
): string {
  for (const line of stack.split("\n")) {
    const m = /https?:\/\/[^\s()]+/.exec(line);
    if (!m) {
      continue;
    }
    let url = m[0];
    const lineCol = url.replace(/:\d+:\d+$/, "");
    url = lineCol !== url ? lineCol : url.replace(/(\/[^/]*):\d+$/, "$1");
    if (skipPrefix && url.startsWith(skipPrefix)) {
      continue;
    }
    const orig = toOriginal(url);
    if (orig === null || !/^https?:\/\//.test(orig)) {
      continue;
    }
    const hash = orig.indexOf("#");
    return hash < 0 ? orig : orig.slice(0, hash);
  }
  return "";
}

/**
 * 再生の URL（`<prefix><ts><mod>/<記録の URL>`）を記録の URL に戻す。prefix の下でなければ null。
 */
export function originalFromReplayUrl(url: string, prefix: string): string | null {
  if (!prefix || !url.startsWith(prefix)) {
    return null;
  }
  const m = /^[0-9]*(?:[a-z]{2,4}_)?\/(.*)$/.exec(url.slice(prefix.length));
  return m ? m[1]! : null;
}

// ===========================================================================
// WACZ から読む

/** MultiWACZ のうち、ここで使う所 */
export type RandomSource = {
  loadFileFromNamedWACZ: (
    waczname: string,
    filename: string,
    opts: Record<string, unknown>,
  ) => Promise<{ reader: { readFully: () => Promise<Uint8Array> } }>;
  waczfiles: Record<string, { entries?: Record<string, { uncompressedSize: number }> | null }>;
};

export function isRandomSource(store: unknown): store is RandomSource {
  return (
    !!store &&
    typeof (store as RandomSource).loadFileFromNamedWACZ === "function" &&
    typeof (store as RandomSource).waczfiles === "object"
  );
}

function hex(buf: ArrayBuffer): string {
  return Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * datapackage.json が `random/values.jsonl` を resources に載せ、`browserhive:capture.random.recorded` が true で、
 * 中身の sha256 が載っている hash と同じときだけ、読んだ行を返す。どれかが欠ければ null（控えを使わない）。
 */
export async function loadRandomLines(
  store: RandomSource,
  waczname: string,
): Promise<Line[] | null> {
  const readText = async (filename: string, limit: number) => {
    const { reader } = await store.loadFileFromNamedWACZ(waczname, filename, {
      unzip: false,
    });
    const bytes = await reader.readFully();
    return bytes.length > limit ? null : bytes;
  };

  const pkgBytes = await readText("datapackage.json", RANDOM_MAX_BYTES);
  if (!pkgBytes) {
    return null;
  }
  const pkg = JSON.parse(new TextDecoder().decode(pkgBytes)) as Record<string, unknown>;
  const capture = pkg["browserhive:capture"] as { random?: { recorded?: unknown } } | undefined;
  if (capture?.random?.recorded !== true) {
    return null;
  }
  const resources = Array.isArray(pkg["resources"])
    ? (pkg["resources"] as { path?: unknown; hash?: unknown }[])
    : [];
  const expected = resources.find((r) => r.path === RANDOM_VALUES_PATH)?.hash;
  if (typeof expected !== "string" || !expected.startsWith("sha256:")) {
    return null;
  }

  // ZIP の目次は datapackage.json を読んだ時に揃っている。大きすぎる物は読み始めない
  const size = store.waczfiles[waczname]?.entries?.[RANDOM_VALUES_PATH]?.uncompressedSize;
  if (typeof size !== "number" || size > RANDOM_MAX_BYTES) {
    return null;
  }
  const bytes = await readText(RANDOM_VALUES_PATH, RANDOM_MAX_BYTES);
  if (!bytes) {
    return null;
  }
  const actual = "sha256:" + hex(await crypto.subtle.digest("SHA-256", bytes));
  if (actual !== expected.toLowerCase()) {
    return null;
  }
  return parseRandomLines(new TextDecoder().decode(bytes));
}

const cache = new WeakMap<object, Map<string, Promise<Line[] | null>>>();

/** 同じ WACZ の控えは一度だけ読む。読めなければ null（再生は控えなしで続ける） */
export function getRandomLines(store: RandomSource, waczname: string): Promise<Line[] | null> {
  let byName = cache.get(store);
  if (!byName) {
    byName = new Map();
    cache.set(store, byName);
  }
  let p = byName.get(waczname);
  if (!p) {
    p = loadRandomLines(store, waczname).catch((e: unknown) => {
      console.warn("capture-player: random/values.jsonl not used", e);
      return null;
    });
    byName.set(waczname, p);
  }
  return p;
}
