import prettyBytes from "pretty-bytes";

import {
  LitElement,
  html,
  css,
  unsafeCSS,
  type PropertyValues,
  nothing,
} from "lit";
import { property, state } from "lit/decorators.js";

import "keyword-mark-element/lib/keyword-mark.js";

import iconImageAlt from "~icons/image-alt.svg";

import { getPageDateTS, getReplayLink } from "./pageutils";

import { wrapCss } from "./misc";
import type { Page, URLTsChange } from "./types";
import {
  dateFormatter,
  dateTimeFormatter,
  timeFormatter,
} from "./utils/dateTimeFormatter";
import type { TabNavEvent } from "./events";
import { ifDefined } from "lit/directives/if-defined.js";

// ===========================================================================
class PageEntry extends LitElement {
  @property({ type: String })
  query = "";

  @property({ type: String })
  textSnippet: string | null = "";

  @property({ type: Object })
  page: Page | null = null;

  @property({ type: String })
  replayPrefix = "";

  @property({ type: Boolean })
  deleting = false;

  @property({ type: Boolean })
  selected = false;

  @property({ type: Boolean })
  editable = false;

  @property({ type: Number })
  index = 0;

  @property({ type: Boolean })
  isCurrent = false;

  @property({ type: Boolean })
  isSidebar = false;

  @property({ type: Boolean })
  useFaviconFallback = false;

  @state()
  thumbnailValid = true;

  // capture-player: 2026-11-15 に足した。いま試している絵の名前の候補（thumbnailCandidates()）の番号（CAPTURE-440）
  @state()
  thumbnailCandidate = 0;

  @state()
  iconValid = true;

  static get styles() {
    return wrapCss(css`
      :host {
        min-height: min-content;
        width: 100%;
        word-break: break-all;
        position: relative;
        display: flex;
        flex-direction: row;
        background: transparent;
      }

      :host(.sidebar) .column {
        width: unset !important;
      }

      :host(.sidebar) .page-title {
        font-size: var(--sl-font-size-small);
      }

      :host(.sidebar) .page-title,
      :host(.sidebar) .page-url {
        display: -webkit-box;
        -webkit-box-orient: vertical;
        -webkit-line-clamp: 2;
        overflow: hidden;
      }

      :host(.sidebar) .page-link:not(.current):hover {
        background-color: var(--sl-color-neutral-50);
      }

      :host(.sidebar) .current {
        background-color: var(--sl-color-blue-100);
      }

      :host(.sidebar) {
        width: 100%;
      }

      .check-select {
        padding: 0 1em 0 0.5em;
        height: 100%;
        margin: auto 0 auto 0;
      }

      .columns {
        width: 100%;
      }

      /* Override Bulma to add the tiniest margin, so the focus indicator isn't obscured */
      .columns {
        margin-top: calc(-0.75rem + 2px);
      }
      .columns:last-child {
        margin-bottom: calc(-0.75rem + 2px);
      }

      .thumbnail {
        background-color: var(--sl-color-neutral-100);
        border: 1px solid var(--sl-color-neutral-200);
        border-radius: var(--sl-border-radius-large);
      }

      /* capture-player: 2026-11-15 に足した。箱は 16:9、BrowserHive の絵は 16:10（1280×800）。歪めずに上を揃えて切る（CAPTURE-440） */
      img.thumbnail {
        object-fit: cover;
        object-position: top center;
      }

      .thumbnail-placeholder {
        position: relative;
      }

      .thumbnail-placeholder-content {
        position: absolute;
        inset: 0;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        overflow: hidden;
        padding: var(--sl-spacing-2x-small);
      }

      .thumbnail-placeholder-content .icon {
        margin: var(--sl-spacing-2x-small) 0;
        color: var(--sl-color-neutral-300);
      }

      .thumbnail-placeholder-label {
        font-size: var(--sl-font-size-2x-small);
        color: var(--sl-color-neutral-500);
        line-height: 1;
      }

      .page-link {
        transition: background-color var(--sl-transition-x-fast);
      }

      .page-link:hover .page-title {
        color: var(--sl-color-blue-700);
      }

      .page-title {
        font-weight: var(--sl-font-weight-bold);
        color: var(--sl-color-blue-600);
        transition: color var(--sl-transition-x-fast);
      }

      .media-left .favicon {
        object-fit: contain;
      }

      .media-content .favicon {
        width: 1.15rem;
        height: 1.15rem;
        margin: 0 0.25rem;
        display: inline-block;
        vertical-align: -0.25rem;
      }

      .media-left {
        width: 6rem;
        align-self: center;
        text-align: center;
      }

      .delete-button {
        position: absolute;
        top: 8px;
        right: 8px;
      }

      .delete:hover {
        background-color: rgb(241, 70, 104);
      }

      .is-loading {
        line-height: 1.5em;
        height: 1.5em;
        border: 0px;
        background-color: transparent !important;
        width: auto;
      }

      @media screen and (max-width: 768px) {
        ${PageEntry.sidebarStyles()}
      }

      ${PageEntry.sidebarStyles(unsafeCSS`:host(.sidebar)`)}

      .is-inline-date {
        display: none;
      }

      .media-content a {
        display: block;
      }

      .col-date {
        font-variant-numeric: tabular-nums;
      }

      .date-time,
      .is-inline-date {
        font-size: var(--sl-font-size-small);
        color: var(--sl-color-neutral-700);
      }

      .page-url {
        font-size: var(--sl-font-size-small);
      }
    `);
  }

  static sidebarStyles(prefix = css``) {
    return css`
      ${prefix} .col-date {
        margin-left: calc(24px + 1rem);
        display: none;
      }
      ${prefix} .col-date div {
        display: inline;
      }
      ${prefix} .col-index {
        display: none;
      }
      ${prefix} .columns {
        display: flex;
        flex-direction: column-reverse;
      }
      ${prefix} .is-inline-date {
        display: initial !important;
      }
    `;
  }

  // capture-player: 2026-11-15 に足した。一覧は行の要素を使い回す（pages.ts の map に鍵が無い）ので、別の頁に
  // 替わったら絵と favicon の試しを始めからやり直す（CAPTURE-440）
  willUpdate(changedProperties: PropertyValues<this>) {
    if (changedProperties.has("page")) {
      this.thumbnailCandidate = 0;
      this.thumbnailValid = true;
      this.iconValid = true;
    }
  }

  updated(changedProperties: PropertyValues<this>) {
    if (changedProperties.has("page") || changedProperties.has("query")) {
      this.updateSnippet();
      this.deleting = false;
    }
  }

  render() {
    const p = this.page!;
    const { date } = getPageDateTS(p);
    // capture-player: 2026-11-12 に改変。BrowserHive の写し（urn:browserhive:snapshot:<時点>:<URL>）の行は、
    // 題に時点を添え、URL の欄に元の文書の URL を出す。リンクは urn のまま（記録を引く鍵）。
    const snapshot = snapshotOf(p.url, (p as { stage?: unknown }).stage);
    const shownUrl = snapshot ? snapshot.url : p.url;
    const shownTitle = snapshot
      ? `${snapshot.label}: ${p.title || snapshot.url}`
      : p.title || p.url;

    const hasSize = typeof p.size === "number";

    const editable = this.editable && !this.isSidebar;

    return html`
      ${editable
        ? html` <div class="check-select">
            <label class="checkbox">
              <input
                @change=${this.onSendSelToggle}
                type="checkbox"
                .checked="${this.selected}"
              />
            </label>
          </div>`
        : ""}

      <div class="columns">
        ${this.index
          ? html`
              <div class="column col-index is-1 is-size-7">${this.index}.</div>
            `
          : ""}
        <div class="column col-date is-2">
          <div>${date ? dateFormatter.format(date) : ""}</div>
          <div class="date-time">${date ? timeFormatter.format(date) : ""}</div>
        </div>
        <div
          class="page-link column ${this.isCurrent ? "current" : ""}"
          aria-current=${ifDefined(this.isCurrent ? "location" : undefined)}
        >
          <div class="media">
            <figure class="media-left">${this.renderPageIcon()}</figure>
            <div class="media-content">
              <div role="heading" aria-level="${this.isSidebar ? "4" : "3"}">
                <a
                  @dblclick="${this.onReload}"
                  @click="${this.onReplay}"
                  href="${getReplayLink(
                    "pages",
                    this.page!.url,
                    this.page!.timestamp,
                    this.page!.waczhash,
                  )}"
                >
                  <p class="page-title text">
                    ${this.thumbnailValid ? this.renderFavicon() : nothing}
                    <keyword-mark keywords="${this.query}" title="${shownTitle}"
                      >${shownTitle}</keyword-mark
                    >
                  </p>
                  <p class="page-url has-text-dark text">
                    <keyword-mark keywords="${this.query}" title="${shownUrl}"
                      >${shownUrl}</keyword-mark
                    >
                  </p>
                  <p class="text is-inline-date">
                    ${date ? dateTimeFormatter.format(date) : ""}
                  </p>
                </a>
                ${this.textSnippet
                  ? html` <div class="text">
                      <keyword-mark keywords="${this.query}"
                        >${this.textSnippet}</keyword-mark
                      >
                    </div>`
                  : html``}
              </div>
              ${hasSize
                ? html` <div class="text">${prettyBytes(p.size)}</div>`
                : ""}
            </div>
          </div>
        </div>

        ${editable
          ? html` ${!this.deleting
              ? html` <button
                  @click="${this.onSendDeletePage}"
                  class="delete delete-button"
                ></button>`
              : html`
                  <button
                    class="button is-loading delete-button is-static"
                  ></button>
                `}`
          : ""}
      </div>
    `;
  }

  // capture-player: 2026-11-15 に改変。時刻を渡せるようにした（CAPTURE-440）
  private getReplayPrefix(ts: string | number = this.page!.ts || "") {
    const waczhash = this.page!.waczhash ? `:${this.page!.waczhash}/` : "";
    return this.replayPrefix + "/" + waczhash + ts + "id_";
  }

  // capture-player: 2026-11-15 に足した。行の絵の名前の候補を、試す順に（CAPTURE-440）。
  // - 文書の行: BrowserHive の after-load の節目のスクリーンショット → 上流の urn:thumbnail:
  // - 写しの行（urn:browserhive:snapshot:<時点>:<URL>）: 同じ時点のスクリーンショットだけ。時点は URN から読む
  //   （合本の /q/ の答えに stage は無い）
  // BrowserHive の名前は 14 桁の時刻で引く。page.ts（13 桁のミリ秒）は wabac.js が時刻として読めず、
  // その名前の一番新しい記録を返す（同じ URL を 2 回撮った合本で、別の回の絵になる）。
  // 上流の候補（urn:thumbnail:・favicon）は上流のとおり page.ts で引く。
  private thumbnailCandidates(): string[] {
    const url = this.page!.url;
    const browserhive = this.getReplayPrefix(
      getPageDateTS(this.page!).timestamp,
    );
    const snapshot = SNAPSHOT_URN.exec(url);
    if (snapshot) {
      return [`${browserhive}/${SCREENSHOT_URN}${snapshot[1]}:${snapshot[2]}`];
    }
    const upstream = `${this.getReplayPrefix()}/urn:thumbnail:${url}`;
    if (!/^https?:/.test(url)) {
      return [upstream];
    }
    return [
      `${browserhive}/${SCREENSHOT_URN}after-load:${url.split("#")[0]}`,
      upstream,
    ];
  }

  // capture-player: 2026-11-15 に足した。絵が読めなければ次の候補へ。候補が尽きたら上流のとおり代わりの箱に替える。
  // 要素の今の src が試している候補と違う error（前の頁の絵など）は捨てる（CAPTURE-440）
  private onThumbnailError(event: Event, candidates: string[]) {
    const img = event.currentTarget as HTMLImageElement;
    if (img.getAttribute("src") !== candidates[this.thumbnailCandidate]) {
      return;
    }
    if (this.thumbnailCandidate + 1 < candidates.length) {
      this.thumbnailCandidate++;
    } else {
      this.thumbnailValid = false;
    }
  }

  private renderPageIcon() {
    if (!this.thumbnailValid) {
      return html`<div
        class="thumbnail-placeholder image is-16by9 ${this.useFaviconFallback
          ? "favicon-fallback"
          : "thumbnail"}"
      >
        <div class="thumbnail-placeholder-content">
          ${this.useFaviconFallback
            ? this.renderFavicon()
            : html`<span class="icon is-small">
                  <wr-icon .svg="${iconImageAlt}" aria-hidden="true"></wr-icon>
                </span>
                <span class="thumbnail-placeholder-label">No image</span>`}
        </div>
      </div>`;
    }

    // capture-player: 2026-11-15 に改変。名前の候補を順に試す（CAPTURE-440）
    const candidates = this.thumbnailCandidates();
    return html`<div class="image is-16by9">
      <img
        class="thumbnail"
        @error=${(event: Event) => this.onThumbnailError(event, candidates)}
        src=${candidates[this.thumbnailCandidate]!}
        loading="lazy"
      />
    </div>`;
  }

  private renderFavicon() {
    if (!this.iconValid || !this.page!.favIconUrl) {
      return;
    }
    return html`<img
      class="favicon"
      @error=${() => (this.iconValid = false)}
      src=${`${this.getReplayPrefix()}/${this.page!.favIconUrl}`}
      loading="lazy"
    />`;
  }

  updateSnippet() {
    const oldVal = this.textSnippet;

    if (!this.query || !this.page!.text) {
      this.textSnippet = null;
      this.requestUpdate("textSnippet", oldVal);
      return;
    }

    let textContent = this.page!.text;
    let query = this.query;

    let inx = textContent.indexOf(this.query);

    if (inx < 0) {
      const textLower = textContent.toLowerCase();
      const queryLower = query.toLowerCase();

      inx = textLower.indexOf(queryLower);

      if (inx < 0) {
        this.textSnippet = null;
        this.requestUpdate("textSnippet", oldVal);
        return;
      }

      textContent = textLower;
      query = queryLower;
    }

    //let lastInx = textContent.lastIndexOf(query);
    let lastInx = inx;

    inx = Math.max(inx - 100, 0);
    lastInx = Math.min(lastInx + 200, textContent.length);

    if (inx === 0 && lastInx === textContent.length) {
      this.textSnippet = textContent;
    } else {
      this.textSnippet = "..." + textContent.slice(inx, lastInx) + "...";
    }

    this.requestUpdate("textSnippet", oldVal);
  }

  onReplay(event: Event, reload = false) {
    event.preventDefault();

    const data: URLTsChange = {
      url: this.page!.url,
      ts: this.page!.timestamp,
      waczhash: this.page!.waczhash,
    };

    this.sendChangeEvent(data, reload);
    return false;
  }

  onReload(event: Event) {
    return this.onReplay(event, true);
  }

  sendChangeEvent(data: URLTsChange, reload: boolean) {
    this.dispatchEvent(
      new CustomEvent<TabNavEvent["detail"]>("coll-tab-nav", {
        bubbles: true,
        composed: true,
        detail: { data, reload },
      }),
    );
  }

  onSendDeletePage() {
    const page = this.page;
    this.dispatchEvent(new CustomEvent("delete-page", { detail: { page } }));
  }

  // @ts-expect-error [// TODO: Fix this the next time the file is edited.] - TS7006 - Parameter 'event' implicitly has an 'any' type.
  onSendSelToggle(event) {
    const page = this.page!.id;
    const selected = event.currentTarget.checked;
    this.dispatchEvent(
      new CustomEvent("sel-page", { detail: { page, selected } }),
    );
  }
}

customElements.define("wr-page-entry", PageEntry);

export { PageEntry };

// capture-player: 2026-11-12 に足した。BrowserHive WARC Profile の写しの URI（urn:browserhive:snapshot:）から、時点と元の文書の URL を読む。
const SNAPSHOT_URN = /^urn:browserhive:snapshot:([a-z-]+):(.+)$/;
// capture-player: 2026-11-15 に足した。節目のスクリーンショットの URI の頭（後ろに <時点>:<文書の URL>。CAPTURE-440）
const SCREENSHOT_URN = "urn:browserhive:screenshot:";
// 2026-11-28（CAPTURE-506）: capture scripts の後の時点は、BrowserHive WACZ Profile 1.30.0 から after-capture-scripts、
// それより前の記録は after-behaviors。どちらも同じ題にする（撮った WACZ は変えないので、古い名もずっと読む）
const STAGE_LABELS: Record<string, string> = {
  "after-load": "Snapshot after load",
  "after-capture-scripts": "Snapshot after capture scripts",
  "after-behaviors": "Snapshot after capture scripts",
};

export function snapshotOf(
  url: string,
  stage: unknown,
): { label: string; url: string } | undefined {
  const m = SNAPSHOT_URN.exec(url);
  if (!m) {
    return undefined;
  }
  const name = typeof stage === "string" && stage ? stage : m[1]!;
  return { label: STAGE_LABELS[name] ?? `Snapshot (${name})`, url: m[2]! };
}
