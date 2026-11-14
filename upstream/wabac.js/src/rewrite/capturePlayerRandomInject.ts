// capture-player: 2026-11-14 に足した（CAPTURE-378）。`<static>/capturePlayerRandom.js` として配り、乱数の控えの
// 行を選べた文書にだけ、wombat の初期化の後に読ませる（collection.ts の makeHeadInsert）。
//
// 同じスクリプトが同じ関数を n 回目（1 から）に呼んだら、控えのその呼び手のその関数の n 番目の値を返す
// （BrowserHive WACZ Profile 1.26.0 の #random-reading）。値が無い・合わない呼び出しには、wombat が返すはずだった
// 値（固定の種の Math.random）を返し、返した数とは別に数える。数は文書ごとに UI へ送る（frame の中の文書も。
// UI が足す）。
import { callerFromStack, originalFromReplayUrl, type RandomValue } from "../capturePlayerRandom";

type RandomData = {
  document: number;
  recorded: number;
  draws: Record<string, RandomValue[]>;
};

type TypedArray = {
  readonly buffer: ArrayBuffer;
  readonly byteOffset: number;
  readonly byteLength: number;
  length: number;
  [i: number]: number;
};

type PageWindow = {
  wbinfo?: {
    bh_random?: RandomData;
    static_prefix?: string;
    prefix?: string;
    top_host?: string;
  };
  Math: { random: () => number };
  crypto?: {
    getRandomValues?: (a: TypedArray) => TypedArray;
    randomUUID?: () => string;
  };
  Crypto?: {
    prototype: {
      getRandomValues?: (a: TypedArray) => TypedArray;
      randomUUID?: () => string;
    };
  };
  Error: { stackTraceLimit?: number; new (): { stack?: unknown } };
  location: { href: string };
  atob: (s: string) => string;
  setTimeout: (f: () => void, ms: number) => number;
  addEventListener: (name: string, f: () => void) => void;
  document: { readyState: string };
  __WB_top_frame?: { postMessage: (m: unknown, origin: string) => void };
};

(function () {
  const win = self as unknown as PageWindow;
  const info = win.wbinfo;
  const data = info?.bh_random;
  if (!info || !data) {
    return;
  }

  const ErrorOf = win.Error;
  const reflectApply = Reflect.apply;
  const atob = win.atob;
  const staticPrefix = new URL(info.static_prefix || "", win.location.href).href;
  const replayPrefix = info.prefix ? new URL(info.prefix, win.location.href).href : "";

  // wombat の Math.random（種を固定した LCG）。値の無い呼び出しにはこれを返す（控えの無い再生と同じ値の列）
  const fallbackRandom = win.Math.random;
  const crypto = win.crypto;
  const cryptoProto = win.Crypto?.prototype;
  const nativeUUID = cryptoProto?.randomUUID;

  const counters = new Map<string, number>();
  let returned = 0;
  let fallback = 0;

  // 記録の URL に戻す。再生の prefix の下に無い物は、同じ origin の別の再生の URL として `/http` から読む
  const toOriginal = (url: string): string | null => {
    const orig = originalFromReplayUrl(url, replayPrefix);
    if (orig !== null) {
      return orig;
    }
    const origin = new URL(win.location.href).origin + "/";
    if (url.startsWith(origin)) {
      const i = url.indexOf("/http", origin.length - 1);
      return i < 0 ? null : url.slice(i + 1);
    }
    return null;
  };

  const callerNow = (): string => {
    // V8 は既定で 10 枠しか残さない。wombat の枠を飛ばしても頁の枠に届くよう、数える間だけ広げる
    const limit = ErrorOf.stackTraceLimit;
    const widen = typeof limit === "number";
    try {
      if (widen) {
        ErrorOf.stackTraceLimit = 64;
      }
      const stack = new ErrorOf().stack;
      return typeof stack === "string" ? callerFromStack(stack, staticPrefix, toOriginal) : "";
    } catch (_) {
      return "";
    } finally {
      if (widen) {
        ErrorOf.stackTraceLimit = limit;
      }
    }
  };

  /** この呼び出しに返す控えの値（無ければ null）。呼び出しを 1 回数える */
  const nextValue = (api: string): RandomValue => {
    const key = `${callerNow()}\n${api}`;
    const n = (counters.get(key) ?? 0) + 1;
    counters.set(key, n);
    return data.draws[key]?.[n - 1] ?? null;
  };

  win.Math.random = function random() {
    const v = nextValue("Math.random");
    if (typeof v === "number" && v >= 0 && v < 1) {
      returned++;
      changed();
      return v;
    }
    fallback++;
    changed();
    return fallbackRandom();
  };

  if (crypto && cryptoProto) {
    // wombat と同じ埋め方。wombat の getRandomValues は window.Math.random を読み直すので呼ばない
    // （呼ぶと、控えの Math.random の値を食ってしまう）
    const fillFallback = (array: TypedArray) => {
      for (let i = 0; i < array.length; i++) {
        array[i] = parseInt(String(fallbackRandom() * 4294967296));
      }
      return array;
    };

    const isIntegerArray = (array: unknown): array is TypedArray => {
      if (!ArrayBuffer.isView(array) || array instanceof DataView) {
        return false;
      }
      const name = reflectApply(Object.prototype.toString, array, []) as string;
      return !/Float(16|32|64)Array/.test(name);
    };

    const getRandomValues = function getRandomValues(array: TypedArray) {
      // 本物が投げる呼び出し（整数の型付き配列でない・64 KiB を超える）は数えない
      if (!isIntegerArray(array) || array.byteLength > 65536) {
        return fillFallback(array);
      }
      const v = nextValue("crypto.getRandomValues");
      if (typeof v === "string") {
        let bin: string | null = null;
        try {
          bin = atob(v);
        } catch (_) {
          bin = null;
        }
        if (bin !== null && bin.length === array.byteLength) {
          const bytes = new Uint8Array(array.buffer, array.byteOffset, array.byteLength);
          for (let i = 0; i < bin.length; i++) {
            bytes[i] = bin.charCodeAt(i);
          }
          returned++;
          changed();
          return array;
        }
      }
      fallback++;
      changed();
      return fillFallback(array);
    };
    cryptoProto.getRandomValues = getRandomValues;
    crypto.getRandomValues = getRandomValues;

    if (nativeUUID) {
      const randomUUID = function randomUUID() {
        const v = nextValue("crypto.randomUUID");
        if (typeof v === "string") {
          returned++;
          changed();
          return v;
        }
        fallback++;
        changed();
        return reflectApply(nativeUUID, crypto, []) as string;
      };
      cryptoProto.randomUUID = randomUUID;
      crypto.randomUUID = randomUUID;
    }
  }

  // UI へ数を送る。wombat の sendTopMessage と同じ先（再生の外の UI の窓）へ、frame の中の文書からも送る。
  // load の後と、その後の変化は間引いて
  let loaded = false;
  let pending = false;
  const send = () => {
    pending = false;
    const top = win.__WB_top_frame;
    if (!top) {
      return;
    }
    top.postMessage(
      {
        wb_type: "bh-random",
        returned,
        fallback,
        recorded: data.recorded,
      },
      info.top_host || "*",
    );
  };
  function changed() {
    if (loaded && !pending) {
      pending = true;
      win.setTimeout(send, 500);
    }
  }
  const onLoad = () => {
    loaded = true;
    send();
  };
  if (win.document.readyState === "complete") {
    win.setTimeout(onLoad, 0);
  } else {
    win.addEventListener("load", onLoad);
  }
})();
