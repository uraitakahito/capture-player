// capture-player: 2026-11-14 に足した（CAPTURE-422）。BrowserHive の WACZ の `datapackage.json` から、撮った時の
// 窓（`browserhive:capture.settings.viewport`）と DPR（`settings.devicePixelRatios`）を読み、再生する文書に渡す。
//
// - 頁の JS が読む `devicePixelRatio`: 先頭に差し込む `wbinfo.pixel_ratio` を撮った時の値にする（wombat の
//   initFixedRatio がそれを window に置く。上流は記録に値が無いと 2）
// - 再生の枠: 文書が画面（replay.ts）へ `wb_type: "bh-env"` で知らせ、画面が枠の大きさと CSS の zoom を決める
//
// 記録の無い WACZ（BrowserHive 以外・値の形が違う）は何も替えない（上流のまま）。ここは純粋な関数と、
// WACZ から datapackage.json を読む関数だけ。乱数の記録（capturePlayerRandom.ts）も同じ読みを使う。

/** これより大きい datapackage.json は読まない */
export const DATAPACKAGE_MAX_BYTES = 4 * 1024 * 1024;

/** MultiWACZ のうち、ここで使う所 */
export type WaczFileSource = {
  loadFileFromNamedWACZ: (
    waczname: string,
    filename: string,
    opts: Record<string, unknown>,
  ) => Promise<{ reader: { readFully: () => Promise<Uint8Array> } }>;
  waczfiles: Record<string, { entries?: Record<string, { uncompressedSize: number }> | null }>;
};

export function isWaczFileSource(store: unknown): store is WaczFileSource {
  return (
    !!store &&
    typeof (store as WaczFileSource).loadFileFromNamedWACZ === "function" &&
    typeof (store as WaczFileSource).waczfiles === "object"
  );
}

/** WACZ の中のファイルを読む。`limit` より大きければ null */
export async function readWaczFile(
  store: WaczFileSource,
  waczname: string,
  filename: string,
  limit: number,
): Promise<Uint8Array | null> {
  const { reader } = await store.loadFileFromNamedWACZ(waczname, filename, {
    unzip: false,
  });
  const bytes = await reader.readFully();
  return bytes.length > limit ? null : bytes;
}

async function loadDatapackage(
  store: WaczFileSource,
  waczname: string,
): Promise<Record<string, unknown> | null> {
  const bytes = await readWaczFile(store, waczname, "datapackage.json", DATAPACKAGE_MAX_BYTES);
  if (!bytes) {
    return null;
  }
  const pkg: unknown = JSON.parse(new TextDecoder().decode(bytes));
  return pkg && typeof pkg === "object" && !Array.isArray(pkg)
    ? (pkg as Record<string, unknown>)
    : null;
}

const packages = new WeakMap<object, Map<string, Promise<Record<string, unknown> | null>>>();

/** 同じ WACZ の datapackage.json は一度だけ読む。読めなければ null */
export function getDatapackage(
  store: WaczFileSource,
  waczname: string,
): Promise<Record<string, unknown> | null> {
  let byName = packages.get(store);
  if (!byName) {
    byName = new Map();
    packages.set(store, byName);
  }
  let p = byName.get(waczname);
  if (!p) {
    p = loadDatapackage(store, waczname).catch((e: unknown) => {
      console.warn("capture-player: datapackage.json not read", e);
      return null;
    });
    byName.set(waczname, p);
  }
  return p;
}

/** 撮った時の窓（CSS の px）と、取り込みが読み込んだ DPR（順のまま） */
export type CaptureEnv = { width: number; height: number; dprs: number[] };

/** 窓の幅と高さとして受ける値（BrowserHive の要求の上限と同じ 1〜7680） */
const isSize = (v: unknown): v is number =>
  typeof v === "number" && Number.isInteger(v) && v >= 1 && v <= 7680;

/** DPR として受ける値 */
const isDpr = (v: unknown): v is number =>
  typeof v === "number" && Number.isFinite(v) && v > 0 && v <= 16;

/**
 * `browserhive:capture.settings` から撮った時の環境を読む。窓の幅と高さと、DPR が 1 つ以上そろわなければ null
 * （推し量った値で替えない）。
 */
export function parseCaptureEnv(pkg: unknown): CaptureEnv | null {
  if (!pkg || typeof pkg !== "object") {
    return null;
  }
  const capture = (pkg as Record<string, unknown>)["browserhive:capture"];
  if (!capture || typeof capture !== "object") {
    return null;
  }
  const settings = (capture as Record<string, unknown>)["settings"];
  if (!settings || typeof settings !== "object") {
    return null;
  }
  const s = settings as Record<string, unknown>;
  const viewport = s["viewport"] as Record<string, unknown> | undefined;
  const dprs = s["devicePixelRatios"];
  if (
    !viewport ||
    typeof viewport !== "object" ||
    !isSize(viewport["width"]) ||
    !isSize(viewport["height"]) ||
    !Array.isArray(dprs) ||
    dprs.length === 0 ||
    !dprs.every(isDpr)
  ) {
    return null;
  }
  return { width: viewport["width"], height: viewport["height"], dprs: [...dprs] };
}

/** その WACZ の撮った時の環境。記録が無ければ null */
export async function getCaptureEnv(
  store: WaczFileSource,
  waczname: string,
): Promise<CaptureEnv | null> {
  return parseCaptureEnv(await getDatapackage(store, waczname));
}

/**
 * 文書の DPR。順は (1) 文書のレコードの `WARC-JSON-Metadata` の `pixelRatio`（上流の wabac.js も読む値）、
 * (2) 乱数の記録の、この文書の行の `dpr`（DPR が 2 つ以上の取り込みでも、文書ごとに正しい）、
 * (3) `devicePixelRatios` の最初の値。
 */
export function chooseDocumentDpr(
  env: CaptureEnv,
  recordPixelRatio: unknown,
  randomDocumentDpr: unknown,
): number {
  const fromRecord = Number(recordPixelRatio);
  if (recordPixelRatio !== undefined && recordPixelRatio !== null && isDpr(fromRecord)) {
    return fromRecord;
  }
  if (isDpr(randomDocumentDpr)) {
    return randomDocumentDpr;
  }
  return env.dprs[0]!;
}

/** 文書から画面へ送る知らせ（`wb_type: "bh-env"`） */
export type CaptureEnvMessage = {
  wb_type: "bh-env";
  width: number;
  height: number;
  dpr: number;
  dprs: number[];
};

/**
 * head の挿し込みに足す断片。wombat の初期化の後に置く。文書が、再生の外の画面（wombat の __WB_top_frame）へ
 * 撮った時の環境を送る。frame の中の文書も送るが、画面は最上位の文書の物だけを使う。
 */
export function buildEnvInsert(env: CaptureEnv, dpr: number): string {
  const message: CaptureEnvMessage = {
    wb_type: "bh-env",
    width: env.width,
    height: env.height,
    dpr,
    dprs: env.dprs,
  };
  // 値は数だけなので、script の中に置いても閉じない
  return `<script>(function () { var top = window.__WB_top_frame; if (top) { top.postMessage(${JSON.stringify(message)}, (window.wbinfo && window.wbinfo.top_host) || "*"); } })();</script>
`;
}
