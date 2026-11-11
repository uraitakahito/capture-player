#!/usr/bin/env node
// upstream/ の下で、取り込んだ時から変わったファイルが、全部 NOTICE.md の表に載っていて、
// コメントの書けるファイルには `capture-player:` の印があるかを見る（AGPL §5 の a を機械で見張る）。
//
// 取り込んだ時の中身は、`git subtree add/pull --squash` が作る commit（文に `git-subtree-dir: <prefix>` を持つ
// 最も新しい物）の木。作業ツリー（追跡していない新しいファイルも含む・.gitignore の物は除く）と比べる。
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const git = (...args) => execFileSync("git", args, { encoding: "utf8", maxBuffer: 1 << 28 });
const PREFIXES = ["upstream/wabac.js", "upstream/replayweb.page"];
// コメントを書けない形。表に載っていれば足りる
const NO_COMMENT = /\.(json|lock|svg|png|ico|txt|md)$|(^|\/)yarn\.lock$/;

const notice = readFileSync("NOTICE.md", "utf8");
const listed = new Set(
  [...notice.matchAll(/^\|\s*\d{4}-\d{2}-\d{2}\s*\|\s*`([^`]+)`\s*\|/gm)].map((m) => m[1]),
);

const problems = [];
let changedCount = 0;
for (const prefix of PREFIXES) {
  const squash = git("log", "-1", "--format=%H", `--grep=^git-subtree-dir: ${prefix}$`).trim();
  if (squash === "") {
    problems.push(`${prefix}: subtree の取り込みの commit が見つからない`);
    continue;
  }
  const base = new Map(
    git("ls-tree", "-r", "-z", squash)
      .split("\0")
      .filter(Boolean)
      .map((line) => {
        const [meta, path] = line.split("\t");
        return [`${prefix}/${path}`, meta.split(" ")[2]];
      }),
  );
  const now = git("ls-files", "-z", "--cached", "--others", "--exclude-standard", "--", prefix)
    .split("\0")
    .filter(Boolean);
  const nowSet = new Set(now);
  const hashes =
    now.length === 0
      ? []
      : git("hash-object", "--", ...now)
          .trim()
          .split("\n");
  const changed = [];
  now.forEach((path, i) => {
    if (base.get(path) !== hashes[i]) changed.push(path);
  });
  for (const path of base.keys()) if (!nowSet.has(path)) changed.push(path);
  changedCount += changed.length;
  for (const path of changed) {
    if (!listed.has(path)) problems.push(`${path}: 変わっているのに NOTICE.md の表に無い`);
    if (nowSet.has(path) && !NO_COMMENT.test(path)) {
      if (!readFileSync(path, "utf8").includes("capture-player:"))
        problems.push(`${path}: 変えたファイルに「capture-player:」の印が無い`);
    }
  }
}
for (const path of listed) {
  if (!PREFIXES.some((p) => path.startsWith(`${p}/`)))
    problems.push(`NOTICE.md: ${path} は upstream/ の下に無い`);
}

if (problems.length > 0) {
  console.error(
    `check:upstream — ${problems.length} 件\n${problems.map((p) => `  ✗ ${p}`).join("\n")}`,
  );
  process.exit(1);
}
console.log(
  `check:upstream — 変わったファイル ${changedCount} 個は、どれも NOTICE.md に載り、印がある`,
);
