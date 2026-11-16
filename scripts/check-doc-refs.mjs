// docs サイト (docs-site/) の参照を照らす。`pnpm run site:check` が `site:build` の後に流す。
//
// 1. 英語の頁と日本語の頁 (ja/ の下) が、ファイル名で対になっている
// 2. 建てた HTML の <a href> と言語の <option value> のうち、サイトの中を指す物が、全部 dist の
//    ファイルに解決する (本文は相対リンクで書くので、行き先は建てた物で照らすしかない)
// 3. 本文が名指す repo の path (`scripts/…` などの code と、GitHub の blob/tree/main/… のリンク) が在る
// 4. README の 2 つの URL が astro.config.ts の site と base に合う
//
// astro build は .md の中の誤りでは落ちないことがあるので、守りはこの検査に置く。
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const site = join(root, "docs-site");
const docs = join(site, "src", "content", "docs");
const dist = join(site, "dist");
const problems = [];

const walk = (dir) =>
  readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? walk(path) : [path];
  });
const posix = (path) => path.split(sep).join("/");

// --- 4 の値: astro.config.ts の site と base
const config = readFileSync(join(site, "astro.config.ts"), "utf8");
const SITE = /const SITE = "([^"]+)"/.exec(config)?.[1];
const BASE = /const BASE = "([^"]+)"/.exec(config)?.[1];
if (SITE === undefined || BASE === undefined) {
  console.error("check-doc-refs: astro.config.ts に const SITE・const BASE が無い");
  process.exit(1);
}

// --- 1. en と ja の対
const pages = walk(docs)
  .filter((path) => /\.mdx?$/.test(path))
  .map((path) => posix(relative(docs, path)));
const en = new Set(pages.filter((path) => !path.startsWith("ja/")));
const ja = new Set(pages.filter((path) => path.startsWith("ja/")).map((path) => path.slice(3)));
for (const path of en) if (!ja.has(path)) problems.push(`${path}: ja/${path} が無い`);
for (const path of ja) if (!en.has(path)) problems.push(`ja/${path}: 英語の ${path} が無い`);

// --- 2. 建てた HTML のリンク
if (!existsSync(dist)) {
  console.error("check-doc-refs: docs-site/dist が無い。先に pnpm run site:build");
  process.exit(1);
}
const htmlFiles = walk(dist).filter((path) => path.endsWith(".html"));
const resolvesInDist = (pathname) => {
  if (!pathname.startsWith(`${BASE}/`)) return false;
  const inside = decodeURIComponent(pathname.slice(BASE.length + 1));
  const target = join(dist, inside);
  if (inside === "" || inside.endsWith("/")) return existsSync(join(target, "index.html"));
  return existsSync(target);
};
let linkCount = 0;
for (const file of htmlFiles) {
  const name = posix(relative(dist, file));
  if (name === "404.html") continue; // 無い頁の答えで、無い /404/ を指す
  const html = readFileSync(file, "utf8");
  const pageUrl = new URL(`${SITE}${BASE}/${name.replace(/index\.html$/, "")}`);
  const refs = [
    ...[...html.matchAll(/<a\b[^>]*\bhref="([^"]*)"/g)].map((m) => m[1]),
    // 言語の切り替え。テーマの option (auto など) を読まないよう、/ で始まる物だけ
    ...[...html.matchAll(/<option\b[^>]*\bvalue="(\/[^"]*)"/g)].map((m) => m[1]),
  ];
  for (const ref of refs) {
    if (ref === "" || ref.startsWith("#")) continue;
    const url = new URL(ref.replaceAll("&amp;", "&"), pageUrl);
    // scheme を書いたリンクは、このサイトの base の下を指すときだけ照らす (同じ github.io の別のサイトは外)。
    // 相対と / 始まりのリンクは必ず照らす (base の外へ出ていれば、それも誤り)
    const absolute = /^[a-z][a-z0-9+.-]*:/i.test(ref);
    if (absolute && !(url.origin === new URL(SITE).origin && url.pathname.startsWith(`${BASE}/`)))
      continue;
    linkCount += 1;
    if (!resolvesInDist(url.pathname)) problems.push(`${name}: ${ref} の行き先が dist に無い`);
  }
}

// --- 3. 本文が名指す repo の path
const REPO_PATH =
  /^(?:scripts|src|test|test-e2e|upstream|docs-site|\.github)\/[\w.@/-]+$|^(?:NOTICE\.md|LICENSE|package\.json|\.nvmrc|Dockerfile)$/;
const BLOB =
  /https:\/\/github\.com\/uraitakahito\/capture-player\/(?:blob|tree)\/main\/([^)#\s]+)/g;
let pathCount = 0;
for (const page of pages) {
  const text = readFileSync(join(docs, page), "utf8").replace(/^```[\s\S]*?^```/gm, "");
  const named = [
    ...[...text.matchAll(/`([^`\s]+)`/g)].map((m) => m[1]).filter((p) => REPO_PATH.test(p)),
    ...[...text.matchAll(BLOB)].map((m) => m[1]),
  ];
  for (const path of named) {
    pathCount += 1;
    if (!existsSync(join(root, path.replace(/\/$/, ""))))
      problems.push(`${page}: ${path} が repo に無い`);
  }
}

// --- 4. README の URL
const readme = readFileSync(join(root, "README.md"), "utf8");
for (const url of [`${SITE}${BASE}/`, `${SITE}${BASE}/ja/`]) {
  if (!readme.includes(`<${url}>`))
    problems.push(`README.md: <${url}> が無い (astro.config.ts の site・base と合わない)`);
}

if (problems.length > 0) {
  for (const problem of problems) console.error(`check-doc-refs: ${problem}`);
  process.exit(1);
}
console.log(
  `check-doc-refs — 頁 ${String(en.size)} 組は en・ja で対、リンク ${String(linkCount)} 本は dist に在り、` +
    `本文の repo の path ${String(pathCount)} 個は在り、README の URL は astro.config.ts と合う`,
);
