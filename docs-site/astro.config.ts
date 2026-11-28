import { defineConfig } from "astro/config";
import starlight from "@astrojs/starlight";

// 公開先は https://uraitakahito.github.io/capture-player/（user page の origin ＋ repo の base）。
// README の 2 つの URL と scripts/check-doc-refs.mjs がこの 2 つの値を読む。
const SITE = "https://uraitakahito.github.io";
const BASE = "/capture-player";

export default defineConfig({
  site: SITE,
  base: BASE,
  // 本文のリンクは相対で書く（../running/）。Starlight は本文の絶対リンク（/running/）に base も
  // /ja も足さないので、絶対で書くと公開先で 404 になる。どのページも末尾が / の dir なので、
  // 相対リンクの起点が揃うよう always にする。リンクの行き先は check-doc-refs.mjs が建てた HTML で照らす。
  trailingSlash: "always",
  integrations: [
    starlight({
      title: "capture-player",
      // 英語が根（接頭辞なし）、日本語は /ja/。訳の無い ja のページは英語に落ちる。
      defaultLocale: "root",
      locales: {
        root: { label: "English", lang: "en" },
        ja: { label: "日本語", lang: "ja" },
      },
      social: [
        { icon: "github", label: "GitHub", href: "https://github.com/uraitakahito/capture-player" },
      ],
      // どの項目にも ja の訳を書く。Starlight はページを訳すがナビゲーションは訳さないので、
      // 書かないと日本語のページが英語の目次にぶら下がる。
      sidebar: [
        { label: "Overview", translations: { ja: "概要" }, slug: "index" },
        {
          label: "The pages of one capture",
          translations: { ja: "1 回の取り込みの頁" },
          slug: "pages",
        },
        {
          label: "What it changes",
          translations: { ja: "上流から変えたこと" },
          slug: "what-it-changes",
        },
        { label: "Running", translations: { ja: "動かす" }, slug: "running" },
        { label: "Development", translations: { ja: "開発" }, slug: "development" },
        { label: "Following upstream", translations: { ja: "上流への追随" }, slug: "upstream" },
      ],
    }),
  ],
});
