/* eslint-env node */
// capture-player: 2026-11-12 に足した。上流の webpack.config.js は変えずに、要る組だけを build する。
//
// - 4 つの組（library・browser・Electron の 2 つ）のうち、browser の組だけ。ui.js と sw.js（wabac の
//   dist/sw.js を写した物）を repo の根に出す。全部の組を一度に build すると最大で 2.85 GB を使い、
//   Apple Container の builder（2 GB）で止まった。browser の組だけなら 1.17 GB で、出力は同じ（2026-11-12 に実測）。
// - __HELPER_PROXY__ を空にする（Google Drive の公開の確かめで、外の Webrecorder の worker を呼ばない）。
// - capture-player の版とソースの URL を入れる（About の AGPL §13 の表示）。GIT_TAG が無ければ main を指す。
const webpack = require("webpack");
const configs = require("./webpack.config.js");

const browserConfig = configs[1];
const tag = process.env.GIT_TAG || "";
const sourceUrl = `https://github.com/uraitakahito/capture-player/tree/${tag || "main"}`;

module.exports = (env, argv) => {
  const config = browserConfig(env, argv);
  for (const plugin of config.plugins) {
    if (plugin instanceof webpack.DefinePlugin) {
      plugin.definitions.__HELPER_PROXY__ = JSON.stringify("");
      plugin.definitions.__CAPTURE_PLAYER_VERSION__ = JSON.stringify(tag || "dev");
      plugin.definitions.__CAPTURE_PLAYER_SOURCE_URL__ = JSON.stringify(sourceUrl);
    }
  }
  return config;
};
