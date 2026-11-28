import { LitElement, html, css, nothing, type PropertyValues } from "lit";
import { ifDefined } from "lit/directives/if-defined.js";
import { property, query, state } from "lit/decorators.js";

import { wrapCss } from "./misc";
import rwpLogo from "~assets/brand/replaywebpage-icon-color.svg";
import type { ItemType } from "./types";
import type { ReplayLoadingDetail, TabNavEvent } from "./events";
// capture-player: 2026-11-14 に足した（CAPTURE-378）
import type { RandomCounts } from "./types";
// capture-player: 2026-11-14 に足した（CAPTURE-422）
import type { CaptureEnvInfo } from "./types";
// capture-player: 2026-11-15 に足した（CAPTURE-147）
import type { ScriptMarks } from "./types";
import { keyed } from "lit/directives/keyed.js";

/**
 * @cssPart iframe
 * @cssPart iframe-container
 * @cssPart iframe-page-not-found
 * @fires update-title
 * @fires coll-tab-nav
 * @fires update-title
 * @fires replay-favicons
 * @fires replay-loading ReplayLoadingDetail
 * @fires cancel-click-download
 * @fires update-download-res-url
 * @fires capture-player-random RandomCounts | null (capture-player: 2026-11-14 に足した)
 * @fires capture-player-script-marks ScriptMarks | null (capture-player: 2026-11-15 に足した)
 */
class Replay extends LitElement {
  @property({ type: Object })
  collInfo: ItemType | Record<string, never> | null = null;

  @property({ type: String })
  sourceUrl: string | null = null;

  // external url set from parent
  @property({ type: String })
  url = "";

  @property({ type: String })
  ts = "";

  @property({ type: String })
  waczhash = "";

  // actual replay url
  @property({ type: String })
  replayUrl = "";

  @property({ type: String })
  replayTS = "";

  @property({ type: String })
  actualTS = "";

  @property({ type: String })
  title = "";

  @property({ type: String })
  iframeUrl: string | null = null;

  @property({ type: Boolean })
  showAuth = false;

  @property({ type: Boolean })
  replayNotFoundError = false;

  @property({ type: Object })
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- requestPermission() type mismatch
  authFileHandle: any = null;

  @property({ type: String })
  downloadResUrl = "";

  @query("iframe")
  readonly iframe?: HTMLIFrameElement | null;

  /**
   * Use key to force iframe to update even if `src` hasn't changed,
   * for example, if the iframe window has navigated to a linked page
   * and is being externally reset to a seed URL.
   */
  @state()
  private iframeUrlUpdateKey?: number;

  private reauthWait: null | Promise<void> = null;

  private _loadPoll: null | number = null;

  private hiliter: HoverHiliter | null = null;

  // capture-player: 2026-11-14 に足した（CAPTURE-378）。再生の中の文書（frame の中も）が送る、乱数の記録から
  // 返した数を、送った窓ごとに、送った文書と一緒に持つ。文書が替わった窓の数は捨てる。帯に出すのは足した数
  private readonly randomByWindow = new Map<
    Window,
    { counts: RandomCounts; doc: Document | null }
  >();
  private randomSum: RandomCounts | null = null;

  // capture-player: 2026-11-15 に足した（CAPTURE-147）。BrowserHive の写しの文書（主・枠の中の子の写しとも）が送る、
  // スクリプトが足した要素の数。乱数の数と同じく、送った窓ごとに送った文書と一緒に持ち、文書が替わった窓の数は
  // 捨てる。どの文書も自分の中の要素だけを数えるので、足しても同じ要素を 2 度数えない
  private readonly marksByWindow = new Map<
    Window,
    { marks: ScriptMarks; doc: Document | null }
  >();
  private marksSum: ScriptMarks | null = null;

  // capture-player: 2026-11-14 に足した（CAPTURE-422）。撮った時の窓で再生する。
  // - 枠を開く前に、service worker に文書の撮った時の環境を訊く（api の bh-env）。答えが来るまで枠を描かない
  // - 文書も環境を知らせる（wb_type: "bh-env"）。枠と食い違えば、枠を合わせて 1 度だけ読み直す
  //   （頁の JS が読み込みの時に選んだ物は、後から枠を替えても替わらないため）
  // - 見せ方は 3 つ: capture（既定。撮った時の窓を見る人の窓に収める）・actual（同じ枠を等倍で）・window（上流と同じ）。
  //   開くたびに capture から始める（覚えない）
  @state()
  private captureEnv: CaptureEnvInfo | null = null;

  @state()
  private captureEnvFor: string | null = null;

  // 枠は about:blank で先に置き、zoom と大きさが枠の中の窓に効いてから（描画の 2 フレームの後）頁の URL を渡す。
  // 作ったばかりの枠に直に URL を渡すと、頁は zoom の効く前の窓（幅が zoom 倍・DPR が画面のまま）で読み始め、
  // その窓の版を一度求める（Chrome 156 で実測）
  @state()
  private frameReadyFor: string | null = null;

  @state()
  private viewMode: "capture" | "actual" | "window" = "capture";

  @state()
  private containerSize = { width: 0, height: 0 };

  private captureReloadedFor: string | null = null;

  private containerObserver: ResizeObserver | null = null;

  private observedContainer: Element | null = null;

  private screenDprQuery: MediaQueryList | null = null;

  private readonly onScreenDprChange = () => {
    this.watchScreenDpr();
    this.requestUpdate();
  };

  disconnectedCallback(): void {
    super.disconnectedCallback();

    if (this._loadPoll) {
      window.clearInterval(this._loadPoll);
    }

    // capture-player: 2026-11-14 に足した（CAPTURE-422）
    this.containerObserver?.disconnect();
    this.screenDprQuery?.removeEventListener("change", this.onScreenDprChange);
  }

  firstUpdated() {
    // capture-player: 2026-11-14 に足した（CAPTURE-422）。見る人の画面の DPR が替わったら（外のモニタへ移す・拡大）枠を計算し直す
    this.watchScreenDpr();
    window.addEventListener("message", (event) => this.onReplayMessage(event));
    // TODO: Fix this the next time the file is edited.
    // eslint-disable-next-line @typescript-eslint/promise-function-async
    navigator.serviceWorker.addEventListener("message", (event) =>
      this.handleSWMessage(event),
    );
  }

  async handleSWMessage(event: MessageEvent) {
    if (
      event.data.type === "authneeded" &&
      this.collInfo &&
      event.data.coll === this.collInfo.coll
    ) {
      if (event.data.fileHandle) {
        this.authFileHandle = event.data.fileHandle;
        try {
          if (
            (await this.authFileHandle.requestPermission({ mode: "read" })) ===
            "granted"
          ) {
            this.showAuth = false;
            this.reauthWait = null;
            this.refresh();
            return;
          }
        } catch (e) {
          console.warn(e);
        }
      } else {
        this.authFileHandle = null;
      }

      if (this.reauthWait) {
        await this.reauthWait;
      } else {
        this.showAuth = true;
      }
    } else if (event.data.type) {
      window.parent.postMessage(event.data);
    }
  }

  doSetIframeUrl() {
    this.iframeUrl =
      this.url && this.collInfo
        ? `${this.collInfo.replayPrefix}/${
            this.waczhash ? `:${this.waczhash}/` : ""
          }${this.ts || ""}mp_/${this.url}`
        : "";
  }

  willUpdate(changedProperties: PropertyValues<this>) {
    if (
      changedProperties.has("sourceUrl") ||
      changedProperties.has("collInfo")
    ) {
      this.reauthWait = null;
    }

    if (
      this.url &&
      (this.replayUrl != this.url || this.replayTS != this.ts) &&
      (changedProperties.has("url") || changedProperties.has("ts"))
    ) {
      this.replayUrl = this.url;
      this.replayTS = this.ts;
      this.showAuth = false;
      this.reauthWait = null;

      const prevIframe = this.iframeUrl;
      this.doSetIframeUrl();

      if (prevIframe === this.iframeUrl) {
        this.iframeUrlUpdateKey = Date.now();
      }
    }
  }

  updated(changedProperties: PropertyValues<this>) {
    // capture-player: 2026-11-14 に足した（CAPTURE-422）
    this.observeContainer();
    if (this.iframeUrl && changedProperties.has("iframeUrl")) {
      void this.lookupCaptureEnv(this.iframeUrl);
    }

    if (this.iframeUrl && changedProperties.has("iframeUrl")) {
      this.waitForLoad();
      // capture-player: 2026-11-14 に足した（CAPTURE-378）。別の頁を開いたら、前の文書の数を捨てる
      this.randomByWindow.clear();
      this.publishRandom();
      // capture-player: 2026-11-15 に足した（CAPTURE-147）
      this.marksByWindow.clear();
      this.publishMarks();

      const detail = { title: "Archived Page", replayTitle: false };
      this.dispatchEvent(
        new CustomEvent("update-title", {
          bubbles: true,
          composed: true,
          detail,
        }),
      );
    }

    if (
      (this.replayUrl && changedProperties.has("replayUrl")) ||
      (this.replayTS && changedProperties.has("replayTS"))
    ) {
      const data = {
        url: this.replayUrl,
        ts: this.replayTS,
        waczhash: this.waczhash,
      };

      this.dispatchEvent(
        new CustomEvent<TabNavEvent["detail"]>("coll-tab-nav", {
          detail: {
            replaceLoc: true,
            data,
            replayNotFoundError: this.replayNotFoundError,
          },
        }),
      );
    }

    if (
      this.title &&
      (changedProperties.has("title") || changedProperties.has("actualTS"))
    ) {
      const detail = {
        title: this.title,
        url: this.replayUrl,
        // send actual ts even if live
        ts: this.actualTS,

        replayTitle: true,
      };
      this.dispatchEvent(
        new CustomEvent("update-title", {
          bubbles: true,
          composed: true,
          detail,
        }),
      );
    }
  }

  setDisablePointer(disable: boolean) {
    const iframe = this.renderRoot.querySelector("iframe");

    if (iframe) {
      iframe.style.pointerEvents = disable ? "none" : "all";
    }
  }

  onReplayMessage(event: MessageEvent) {
    const iframe = this.renderRoot.querySelector("iframe");

    // capture-player: 2026-11-14 に足した（CAPTURE-422）。撮った時の環境は、再生の一番上の文書の物だけを使う
    if (iframe && event.data?.wb_type === "bh-env") {
      if (event.source === iframe.contentWindow) {
        void this.onCaptureEnv(iframe, event.data);
      }
      return;
    }

    // capture-player: 2026-11-14 に足した（CAPTURE-378）。乱数の記録の数は、再生の中の frame の文書からも届く。
    // UI で使い、親の窓へは渡さない
    if (iframe && event.data?.wb_type === "bh-random") {
      const source = event.source as Window | null;
      if (source && this.isInReplay(source, iframe)) {
        this.onRandomCounts(source, event.data);
      }
      return;
    }

    // capture-player: 2026-11-15 に足した（CAPTURE-147）。スクリプトが足した要素の数も、枠の中の文書から届く。
    // UI で使い、親の窓へは渡さない
    if (iframe && event.data?.wb_type === "bh-script-marks") {
      const source = event.source as Window | null;
      if (source && this.isInReplay(source, iframe)) {
        this.onScriptMarks(source, event.data);
      }
      return;
    }

    if (iframe && event.source === iframe.contentWindow) {
      if (
        event.data.wb_type === "load" ||
        event.data.wb_type === "replace-url" ||
        event.data.wb_type === "archive-not-found"
      ) {
        this.replayTS = event.data.is_live ? "" : event.data.ts;
        this.actualTS = event.data.ts;
        this.replayUrl = event.data.url;
        this.title = event.data.title || this.title;
        this.replayNotFoundError = event.data.wb_type === "archive-not-found";
        this.clearLoading(iframe);
        // capture-player: 2026-11-14 に足した（CAPTURE-378）。文書が替わった窓の数を捨てる
        this.pruneRandom();
        // capture-player: 2026-11-15 に足した（CAPTURE-147）
        this.pruneMarks();

        if (event.data.icons) {
          const icons = event.data.icons;
          this.dispatchEvent(
            new CustomEvent("replay-favicons", {
              bubbles: true,
              composed: true,
              detail: { icons },
            }),
          );
        }
      } else if (event.data.wb_type === "title") {
        this.title = event.data.title;
      } else {
        const passEvent = { type: event.data.wb_type, ...event.data };
        delete passEvent.wb_type;
        window.parent.postMessage(passEvent);
      }
    }
  }

  // capture-player: 2026-11-14 に足した（CAPTURE-378）。win が再生の iframe の窓か、その中の frame の窓か
  private isInReplay(win: Window, iframe: HTMLIFrameElement): boolean {
    try {
      for (
        let w: Window | null = win;
        w;
        w = w.parent === w ? null : w.parent
      ) {
        if (w === iframe.contentWindow) {
          return true;
        }
      }
    } catch (_) {
      // 読めない窓は再生の中ではない
    }
    return false;
  }

  // capture-player: 2026-11-14 に足した（CAPTURE-378）
  private windowDocument(win: Window): Document | null {
    try {
      return win.closed ? null : win.document;
    } catch (_) {
      return null;
    }
  }

  // capture-player: 2026-11-14 に足した（CAPTURE-378）
  private onRandomCounts(win: Window, data: Record<string, unknown>) {
    const { returned, fallback, recorded } = data;
    if (
      typeof returned !== "number" ||
      typeof fallback !== "number" ||
      typeof recorded !== "number"
    ) {
      return;
    }
    this.randomByWindow.set(win, {
      counts: { returned, fallback, recorded },
      doc: this.windowDocument(win),
    });
    this.pruneRandom();
  }

  // capture-player: 2026-11-14 に足した（CAPTURE-378）。閉じた窓・別の文書に替わった窓の数を捨てる
  private pruneRandom() {
    for (const [win, entry] of this.randomByWindow) {
      const doc = this.windowDocument(win);
      if (!doc || doc !== entry.doc) {
        this.randomByWindow.delete(win);
      }
    }
    this.publishRandom();
  }

  // capture-player: 2026-11-14 に足した（CAPTURE-378）。足した数を item.ts の再生の帯へ（変わった時だけ）
  private publishRandom() {
    const all = [...this.randomByWindow.values()].map((e) => e.counts);
    const next: RandomCounts | null =
      all.length === 0
        ? null
        : all.reduce(
            (sum, c) => ({
              recorded: sum.recorded + c.recorded,
              returned: sum.returned + c.returned,
              fallback: sum.fallback + c.fallback,
            }),
            { recorded: 0, returned: 0, fallback: 0 },
          );
    if (JSON.stringify(next) === JSON.stringify(this.randomSum)) {
      return;
    }
    this.randomSum = next;
    this.dispatchEvent(
      new CustomEvent<RandomCounts | null>("capture-player-random", {
        bubbles: true,
        composed: true,
        detail: next,
      }),
    );
  }

  // capture-player: 2026-11-15 に足した（CAPTURE-147）。形を確かめてから、送った窓の数として持つ
  private onScriptMarks(win: Window, data: Record<string, unknown>) {
    const { count, byId } = data;
    if (
      typeof count !== "number" ||
      !Number.isInteger(count) ||
      count < 0 ||
      !byId ||
      typeof byId !== "object"
    ) {
      return;
    }
    const ids = new Map<string, number>();
    for (const [id, n] of Object.entries(byId)) {
      if (typeof n !== "number" || !Number.isInteger(n) || n <= 0) {
        return;
      }
      ids.set(id, n);
    }
    this.marksByWindow.set(win, {
      marks: { count, byId: ids },
      doc: this.windowDocument(win),
    });
    this.pruneMarks();
  }

  // capture-player: 2026-11-15 に足した（CAPTURE-147）。閉じた窓・別の文書に替わった窓の数を捨てる
  private pruneMarks() {
    for (const [win, entry] of this.marksByWindow) {
      const doc = this.windowDocument(win);
      if (!doc || doc !== entry.doc) {
        this.marksByWindow.delete(win);
      }
    }
    this.publishMarks();
  }

  // capture-player: 2026-11-15 に足した（CAPTURE-147）。窓ごとの数を足して item.ts の再生の帯へ（変わった時だけ）
  private publishMarks() {
    let next: ScriptMarks | null = null;
    for (const { marks } of this.marksByWindow.values()) {
      next ??= { count: 0, byId: new Map() };
      next.count += marks.count;
      for (const [id, n] of marks.byId) {
        next.byId.set(id, (next.byId.get(id) ?? 0) + n);
      }
    }
    const key = (m: ScriptMarks | null) =>
      m ? JSON.stringify([m.count, [...m.byId].sort()]) : "null";
    if (key(next) === key(this.marksSum)) {
      return;
    }
    this.marksSum = next;
    this.dispatchEvent(
      new CustomEvent<ScriptMarks | null>("capture-player-script-marks", {
        bubbles: true,
        composed: true,
        detail: next,
      }),
    );
  }

  // capture-player: 2026-11-14 に足した（CAPTURE-422）。答えの形を確かめてから使う
  private static toCaptureEnv(v: unknown): CaptureEnvInfo | null {
    if (!v || typeof v !== "object") {
      return null;
    }
    const { width, height, dpr, dprs } = v as Record<string, unknown>;
    const positive = (n: unknown): n is number =>
      typeof n === "number" && Number.isFinite(n) && n > 0;
    if (
      !positive(width) ||
      !positive(height) ||
      !positive(dpr) ||
      !Array.isArray(dprs) ||
      !dprs.every(positive)
    ) {
      return null;
    }
    return { width, height, dpr, dprs: dprs as number[] };
  }

  // capture-player: 2026-11-14 に足した（CAPTURE-422）。枠を開く前に、文書の撮った時の環境を service worker に訊く
  private async lookupCaptureEnv(forUrl: string) {
    let env: CaptureEnvInfo | null = null;
    if (this.collInfo?.apiPrefix && this.url) {
      const abort = new AbortController();
      const timer = window.setTimeout(() => abort.abort(), 5000);
      try {
        const query = new URLSearchParams({ url: this.url, ts: this.ts || "" });
        const resp = await fetch(`${this.collInfo.apiPrefix}/bh-env?${query.toString()}`, {
          signal: abort.signal,
        });
        if (resp.ok) {
          env = Replay.toCaptureEnv(((await resp.json()) as { env?: unknown }).env);
        }
      } catch (_) {
        // 訊けなければ、文書の知らせ（bh-env）を待つ
      } finally {
        window.clearTimeout(timer);
      }
    }
    if (this.iframeUrl !== forUrl) {
      return;
    }
    this.captureEnv = env;
    this.captureEnvFor = forUrl;
    await this.updateComplete;
    await Replay.afterLayout();
    if (this.iframeUrl === forUrl) {
      this.frameReadyFor = forUrl;
    }
  }

  // capture-player: 2026-11-14 に足した（CAPTURE-422）。描画の 2 フレームの後（style が枠に効いた後）
  private static afterLayout(): Promise<void> {
    return new Promise((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
    );
  }

  // capture-player: 2026-11-14 に足した（CAPTURE-422）。文書が知らせた環境が枠と違えば、枠を合わせて 1 度だけ読み直す
  private async onCaptureEnv(iframe: HTMLIFrameElement, data: unknown) {
    const env = Replay.toCaptureEnv(data);
    const prev = this.captureEnv;
    if (
      !env ||
      (prev &&
        prev.width === env.width &&
        prev.height === env.height &&
        prev.dpr === env.dpr &&
        prev.dprs.join() === env.dprs.join())
    ) {
      return;
    }
    this.captureEnv = env;
    if (this.viewMode === "window") {
      return;
    }
    let href = "";
    try {
      href = iframe.contentWindow?.location.href ?? "";
    } catch (_) {
      return;
    }
    if (!href || this.captureReloadedFor === href) {
      return;
    }
    this.captureReloadedFor = href;
    await this.updateComplete;
    await Replay.afterLayout();
    this.waitForLoad();
    iframe.contentWindow?.location.reload();
  }

  // capture-player: 2026-11-14 に足した（CAPTURE-422）。枠の大きさが替わる見せ方の切り替えは、読み直して頁の JS に選び直させる
  private async setViewMode(mode: "capture" | "actual" | "window") {
    const reload = (mode === "window") !== (this.viewMode === "window");
    this.viewMode = mode;
    if (!reload) {
      return;
    }
    await this.updateComplete;
    await Replay.afterLayout();
    const iframe = this.renderRoot.querySelector("iframe");
    this.waitForLoad();
    iframe?.contentWindow?.location.reload();
  }

  // capture-player: 2026-11-14 に足した（CAPTURE-422）
  private observeContainer() {
    const container = this.renderRoot.querySelector(".iframe-container");
    if (container === this.observedContainer) {
      return;
    }
    this.containerObserver?.disconnect();
    this.observedContainer = container;
    if (!container) {
      return;
    }
    this.containerObserver ??= new ResizeObserver((entries) => {
      const box = entries[entries.length - 1]?.contentRect;
      if (
        box &&
        (box.width !== this.containerSize.width ||
          box.height !== this.containerSize.height)
      ) {
        this.containerSize = { width: box.width, height: box.height };
      }
    });
    this.containerObserver.observe(container);
  }

  // capture-player: 2026-11-14 に足した（CAPTURE-422）
  private watchScreenDpr() {
    this.screenDprQuery?.removeEventListener("change", this.onScreenDprChange);
    this.screenDprQuery = window.matchMedia(
      `(resolution: ${String(window.devicePixelRatio || 1)}dppx)`,
    );
    this.screenDprQuery.addEventListener("change", this.onScreenDprChange);
  }

  // capture-player: 2026-11-14 に足した（CAPTURE-422）。撮った時の窓の見え方の数。見る倍率 shown は CSS の px あたり
  private captureLayout(env: CaptureEnvInfo) {
    const { width, height } = this.containerSize;
    const fit =
      width > 0 && height > 0
        ? Math.min(width / env.width, height / env.height)
        : 1;
    const shown = this.viewMode === "actual" ? 1 : fit;
    // 枠の中の DPR を撮った時の値にする。zoom を掛けた枠は、見る人の画面の px で env.dpr 倍の細かさで描かれる
    const zoom = env.dpr / (window.devicePixelRatio || 1);
    return {
      fit,
      shown,
      zoom,
      scale: shown / zoom,
      left: Math.max(0, (width - env.width * shown) / 2),
    };
  }

  // capture-player: 2026-11-14 に足した（CAPTURE-422）
  private renderCaptureBar() {
    if (!this.iframeUrl || this.captureEnvFor !== this.iframeUrl) {
      return nothing;
    }
    const env = this.captureEnv;
    if (!env) {
      return html`<div class="capture-bar" id="capture-bar">
        <span>No capture window recorded — shown in your window</span>
      </div>`;
    }
    if (this.viewMode === "window") {
      return html`<div class="capture-bar is-window" id="capture-bar">
        <span>Your window — images and layout may differ from the capture</span>
        <button @click=${() => void this.setViewMode("capture")}>
          Use capture window
        </button>
      </div>`;
    }
    const dpr =
      env.dprs.length > 1
        ? `DPR ${String(env.dpr)} (captured at ${env.dprs.join(", ")})`
        : `DPR ${String(env.dpr)}`;
    const size =
      this.viewMode === "actual"
        ? "actual size"
        : `scaled to ${String(Math.round(this.captureLayout(env).fit * 100))}%`;
    return html`<div class="capture-bar" id="capture-bar">
      <span
        >Capture window ${env.width}×${env.height} · ${dpr} — ${size}</span
      >
      <button
        @click=${() =>
          void this.setViewMode(
            this.viewMode === "actual" ? "capture" : "actual",
          )}
      >
        ${this.viewMode === "actual" ? "Fit to window" : "Actual size"}
      </button>
      <button @click=${() => void this.setViewMode("window")}>
        Use my window
      </button>
    </div>`;
  }

  // capture-player: 2026-11-14 に足した（CAPTURE-422）。枠の入れ物と枠の style。window の見せ方と、環境の無いときは上流のまま
  private captureFrameStyles(): { box: string; frame: string } | null {
    const env = this.captureEnv;
    if (!env || this.viewMode === "window") {
      return null;
    }
    const { shown, zoom, scale, left } = this.captureLayout(env);
    return {
      box: `left:${String(left)}px;width:${String(env.width * shown)}px;height:${String(env.height * shown)}px;`,
      frame: `width:${String(env.width)}px;height:${String(env.height)}px;right:auto;bottom:auto;zoom:${String(zoom)};transform:scale(${String(scale)});transform-origin:0 0;`,
    };
  }

  // @ts-expect-error [// TODO: Fix this the next time the file is edited.] - TS7006 - Parameter 'event' implicitly has an 'any' type.
  onReAuthed(event) {
    this.reauthWait = (async () => {
      if (!this.authFileHandle) {
        // google drive reauth
        const headers = event.detail.headers;

        await fetch(`${this.collInfo!.apiPrefix}/updateAuth`, {
          method: "POST",
          body: JSON.stringify({ headers }),
        });
      } else {
        if (
          (await this.authFileHandle.requestPermission({ mode: "read" })) !==
          "granted"
        ) {
          this.reauthWait = null;
          return;
        }
        this.authFileHandle = null;
      }

      if (this.showAuth) {
        this.showAuth = false;
        this.reauthWait = null;
      }
      this.refresh();
    })();
  }

  waitForLoad() {
    this.setLoading();
    this._loadPoll = window.setInterval(() => {
      const iframe = this.renderRoot.querySelector("iframe");
      if (
        !iframe?.contentDocument ||
        !iframe.contentWindow ||
        (iframe.contentDocument.readyState === "complete" &&
          !(iframe.contentWindow as Window & { _WBWombat: unknown })._WBWombat)
      ) {
        this.clearLoading(iframe);
      }
    }, 5000);
  }

  clearLoading(iframe: HTMLIFrameElement | null) {
    this.dispatchEvent(
      new CustomEvent<ReplayLoadingDetail>("replay-loading", {
        detail: {
          loading: false,
          replayNotFoundError: this.replayNotFoundError,
        },
      }),
    );

    if (this._loadPoll) {
      window.clearInterval(this._loadPoll);
      this._loadPoll = null;
    }

    const iframeWin = iframe?.contentWindow;

    if (iframeWin) {
      try {
        iframeWin.addEventListener("beforeunload", () => {
          this.setLoading();
        });
      } catch (e) {
        // ignore
      }
    }
  }

  setLoading() {
    this.clearHilite(true);
    this.dispatchEvent(
      new CustomEvent<ReplayLoadingDetail>("replay-loading", {
        detail: {
          loading: true,
        },
      }),
    );
  }

  refresh() {
    const iframe = this.renderRoot.querySelector("iframe");

    if (!iframe) {
      return;
    }

    const oldIframeUrl = this.iframeUrl;
    // set iframe url to expected, refresh if same url
    this.doSetIframeUrl();
    if (oldIframeUrl === this.iframeUrl || this.url === this.replayUrl) {
      this.waitForLoad();
      iframe.contentWindow?.location.reload();
    }
  }

  static get styles() {
    return wrapCss(css`
      :host {
        display: flex;
        flex-direction: column;
        height: 100%;
        color-scheme: light dark;
      }

      .iframe-container {
        position: relative;
        width: 100%;
        height: 100%;
        border: 0px;
      }

      /* capture-player: 2026-11-14 に足した（CAPTURE-422）。撮った時の窓の 1 行と、枠の入れ物。
         1 行は明るい地で描く。:host が color-scheme: light dark なので、ダークモードではボタンの字の既定の色が
         白になる（地も白で、字が見えなかった）。地と字の色を両方決め、color-scheme も light にする */
      .capture-bar {
        color-scheme: light;
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: 0.5em;
        padding: 2px 8px;
        font-size: 12px;
        line-height: 1.6;
        background: #eef0f8;
        color: #1f2330;
        border-bottom: 1px solid #d8dbe6;
      }
      .capture-bar.is-window {
        background: #fdf1dc;
      }
      .capture-bar button {
        color: #1f2330;
        font-size: 12px;
        padding: 0 8px;
        border: 1px solid #b9bfd0;
        border-radius: 999px;
        background: #fff;
        cursor: pointer;
      }
      .iframe-container.capture-mode {
        flex: 1;
        min-height: 0;
        height: auto;
        overflow: auto;
      }
      .iframe-container.capture-mode.is-actual {
        background: #f6f7fb;
      }
      .capture-frame {
        position: absolute;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
      }

      .iframe-main {
        position: absolute;
        top: 0px;
        left: 0px;
        right: 0px;
        bottom: 0px;
        width: 100%;
        height: 100%;
      }

      .intro-panel .panel-heading {
        font-size: 1em;
        display: inline-block;
      }

      .iframe-main.modal-bg {
        z-index: 200;
        background-color: rgba(10, 10, 10, 0.7);
      }

      #wrlogo {
        vertical-align: middle;
      }

      .intro-panel .panel-block {
        padding: 1em;
        flex-direction: column;
        line-height: 2.5em;
      }

      div.intro-panel.panel {
        min-width: 40%;
        display: flex;
        flex-direction: column;
        margin: 3em;
        background-color: white;
      }

      .hilite-overlay {
        display: none;
        position: absolute;
        z-index: 9999;
        background-color: rgba(0, 0, 255, 0.5);
        border: solid 10px blue;
        cursor: crosshair;
      }
    `);
  }

  render() {
    const title = `Replay of ${this.title ? `${this.title}:` : ""} ${this.url}`;

    return html` <h1 id="replay-heading" class="is-sr-only">${title}</h1>

      ${!this.iframeUrl
        ? html` <div class="panel intro-panel">
            <p class="panel-heading">Replay Web Page</p>
            <div class="panel-block">
              <p>Enter a URL above to replay it from the web archive!</p>
              <p>
                (Or, check out <a href="#view=pages">Pages</a> or
                <a href="#view=resources">URLs</a> to explore the contents of
                this archive.)
              </p>
            </div>
          </div>`
        : html`
            <a
              href="${this.downloadResUrl}"
              @click="${this.hiliteClicked}"
              class="hilite-overlay"
              download="${ifDefined(
                this.downloadResUrl.startsWith("blob:")
                  ? "image.svg"
                  : undefined,
              )}"
            ></a>
            ${this.renderCaptureBar()}
            <div
              part="iframe-container"
              class="iframe-container capture-mode ${this.viewMode === "actual"
                ? "is-actual"
                : ""}"
            >
              <div
                class="capture-frame"
                style=${ifDefined(this.captureFrameStyles()?.box ?? undefined)}
              >
              ${this.captureEnvFor !== this.iframeUrl
                ? nothing
                : keyed(
                this.iframeUrlUpdateKey,
                html`<iframe
                  part="iframe ${this.replayNotFoundError
                    ? "iframe-page-not-found"
                    : ""}"
                  class="iframe-main"
                  name="___wb_replay_top_frame"
                  @message="${this.onReplayMessage}"
                  allow="autoplay 'self'; fullscreen"
                  allowfullscreen
                  src="${this.frameReadyFor === this.iframeUrl
                    ? this.iframeUrl
                    : "about:blank"}"
                  title="${title}"
                  style=${ifDefined(this.captureFrameStyles()?.frame ?? undefined)}
                ></iframe>`,
              )}
              </div>
              ${this.showAuth
                ? html`
                    <div class="iframe-main modal-bg">
                      <div class="panel intro-panel">
                        <p class="panel-heading">
                          <fa-icon
                            id="wrlogo"
                            size="1.5rem"
                            .svg=${rwpLogo}
                            aria-hidden="true"
                          ></fa-icon>
                          Authorization Needed
                        </p>
                        <div class="panel-block">
                          ${this.authFileHandle
                            ? html`
                                <p>
                                  This archive is loaded from a local file:
                                  <b>${this.authFileHandle.name}</b>
                                </p>
                                <p>
                                  The browser needs to confirm your permission
                                  to continue loading from this file.
                                </p>
                                <button
                                  class="button is-warning is-rounded"
                                  @click="${this.onReAuthed}"
                                >
                                  Show Confirmation
                                </button>
                              `
                            : html` <wr-gdrive
                                .sourceUrl="${this.sourceUrl!}"
                                state="trymanual"
                                .reauth="${true}"
                                @load-ready="${this.onReAuthed}"
                              ></wr-gdrive>`}
                        </div>
                      </div>
                    </div>
                  `
                : ""}
            </div>
          `}`;
  }

  clearHilite(removeListeners = false) {
    if (this.hiliter) {
      this.hiliter.clearHilite(removeListeners);
      this.hiliter = null;
    }

    if (removeListeners) {
      this.removeEventListener(
        "update-download-res-url",
        this.onUpdateDownloadResUrl,
      );
      this.dispatchEvent(new CustomEvent("cancel-click-download"));
    }
  }

  hiliteClicked() {
    this.clearHilite(true);
    return true;
  }

  onUpdateDownloadResUrl(e: Event) {
    const { url } = (e as CustomEvent).detail;
    this.downloadResUrl = url;
  }

  setClickToDownload() {
    if (this.hiliter) {
      return;
    }

    this.addEventListener(
      "update-download-res-url",
      this.onUpdateDownloadResUrl,
    );

    try {
      this.hiliter = new HoverHiliter(this);
    } catch (e) {
      this.hiliter = null;
    }
  }
}

// ===========================================================================
class HoverHiliter {
  doc: Document;
  replay: Replay;

  hiliteElem: HTMLElement | null = null;
  hiliteOverlay: HTMLElement;
  iframe: HTMLIFrameElement;

  onMove: (event: MouseEvent) => void;
  onRecompute: () => void;

  constructor(replay: Replay) {
    this.replay = replay;

    const iframe = this.replay.renderRoot.querySelector("iframe");
    const hiliteOverlay =
      this.replay.renderRoot.querySelector(".hilite-overlay");

    if (!hiliteOverlay || !iframe?.contentDocument) {
      throw new Error("missing elements");
    }

    this.iframe = iframe;
    this.hiliteOverlay = hiliteOverlay as HTMLElement;

    this.onMove = (event: MouseEvent) => this.hiliteOnMove(event);
    this.onRecompute = () => this.hiliteRecompute();

    const doc = iframe.contentDocument;

    this.doc = doc;

    doc.addEventListener("mousemove", this.onMove);

    doc.addEventListener("scroll", this.onRecompute);

    doc.defaultView?.addEventListener("resize", this.onRecompute);
  }

  clearHilite(removeListeners = false) {
    if (removeListeners) {
      this.doc.removeEventListener("mousemove", this.onMove);

      this.doc.removeEventListener("scroll", this.onRecompute);

      this.doc.defaultView?.removeEventListener("scroll", this.onRecompute);
    }
    this.hiliteElem = null;

    this.hiliteOverlay.style.display = "none";
  }

  hiliteRecompute() {
    if (!this.hiliteElem) {
      return;
    }
    const iframeRect = this.iframe.getBoundingClientRect();
    const elemRect = this.hiliteElem.getBoundingClientRect();

    const offset = 10;

    const leftX = iframeRect.left + window.scrollX + elemRect.left - offset;
    const topY = iframeRect.top + window.scrollY + elemRect.top - offset;

    const hilite = this.hiliteOverlay;

    hilite.style.left = leftX + "px";
    hilite.style.top = topY + "px";
    hilite.style.width = elemRect.width + offset * 2 + "px";
    hilite.style.height = elemRect.height + offset * 2 + "px";
    hilite.style.display = "block";
  }

  hiliteOnMove(event: MouseEvent) {
    const elem = this.hiliteFindBestElement(event.clientX, event.clientY);

    if (elem && this.hiliteElem === elem) {
      return;
    }

    const getSrc = (elem: HTMLElement | null): string => {
      if (!elem) {
        return "";
      }

      if ((elem as HTMLImageElement).currentSrc) {
        return (elem as HTMLImageElement).currentSrc;
      }

      if (elem.tagName === "image") {
        const href = elem.getAttribute("href");
        if (href) {
          return href;
        }
      }

      if (elem.tagName === "svg") {
        if (!elem.getAttribute("xmlns")) {
          elem.setAttribute("xmlns", "http://www.w3.org/2000/svg");
        }
        const buff = new TextEncoder().encode(elem.outerHTML);
        const blob = new Blob([buff], { type: "image/svg+xml" });
        return URL.createObjectURL(blob);
      }

      const src = HTMLElement.prototype.getAttribute.call(elem, "src");
      if (src) {
        return src;
      }

      if (elem.style.backgroundImage) {
        return elem.style.backgroundImage.replace(
          /(url\s*\(\s*[\\"']*)([^)'"]+)([\\"']*\s*\)?)/i,
          "$2",
        );
      }

      return "";
    };

    const src = getSrc(elem);

    if (src) {
      const newSrc = src.replace(
        /([\d]*)([\w][\w]_)(\/(https:|http:)?\/)/,
        "$1dl_$3",
      );
      this.replay.dispatchEvent(
        new CustomEvent("update-download-res-url", { detail: { url: newSrc } }),
      );
      this.hiliteElem = elem;
      this.hiliteRecompute();
    } else {
      this.clearHilite();
    }
  }

  hiliteFindBestElement(x: number, y: number): HTMLElement | null {
    const elems = this.doc.elementsFromPoint(x, y) as HTMLElement[];

    if (!elems.length) {
      return null;
    }

    const firstElem = elems[0];

    const containsRect = (rect: DOMRect) => {
      return (
        rect.x >= firstRect.x &&
        rect.y >= firstRect.y &&
        rect.width <= firstRect.width &&
        rect.height <= firstRect.height
      );
    };

    // allow other elements only if they're within same bounding rect
    // as the deepest element
    const firstRect = firstElem.getBoundingClientRect();
    let isLast = false;
    for (const elem of elems) {
      const rect = elem.getBoundingClientRect();
      if (elem === firstElem || containsRect(rect)) {
        if (
          (elem as HTMLImageElement).currentSrc ||
          (elem.hasAttribute("src") && !(elem instanceof HTMLIFrameElement))
        ) {
          return elem;
        }

        if (elem.tagName === "image" && elem.hasAttribute("href")) {
          return elem;
        }

        if (elem.tagName === "svg") {
          return elem;
        }
      } else {
        isLast = true;
      }

      const subelem =
        elem.querySelector("[src]:not(script)") ||
        elem.querySelector(`div[style*="background-image: url("]`);
      if (subelem) {
        const subRect = subelem.getBoundingClientRect();
        if (
          containsRect(subRect) &&
          x >= subRect.left &&
          y >= subRect.top &&
          x < subRect.right &&
          y <= subRect.bottom
        ) {
          return subelem as HTMLElement | null;
        }
      }

      if (isLast) {
        break;
      }
    }

    return null;
  }
}

customElements.define("wr-coll-replay", Replay);

export { Replay };
