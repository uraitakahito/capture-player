// e2e の見本 snapshots-capture-scripts.wacz を、本物の snapshots.wacz から書き出す（CAPTURE-506）。
//
//   node test-e2e/fixtures/derive-capture-scripts.ts
//
// capture scripts の後の時点の名は、BrowserHive WACZ Profile 1.30.0（WARC Profile 1.8.0）から after-behaviors でなく
// after-capture-scripts。新しい名の本物を撮れるようになる前に、新しい名の WACZ を開く試験を書くため、時点の名と
// 名乗る版だけを替えた物を作る:
// - 時点の名: pages.jsonl・datapackage.json・accessibility/axtree.jsonl・索引の字と、WARC のレコードの見出し
//   （WARC-Target-URI）と metadata の本文（snapshot: の欄）
// - 名乗る版: datapackage.json の conformsTo を WACZ Profile 1.30.0 に、warcinfo の conformsTo を WARC Profile 1.8.0 に
// 本文を替えたレコードは Content-Length と WARC-Block-Digest を計り直し、索引の offset と length も WARC に合わせる。
// datapackage.json の resources の hash と bytes、datapackage-digest.json も計り直す（作り物だが、中の数は合う）。
//
// 変えないエントリは、元の ZIP の圧縮したバイト列をそのまま写す。何度流しても同じバイト列になる。
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { gunzipSync, gzipSync } from "node:zlib";
import { content, readZip, replace, writeZip, type Entry } from "./wacz-zip.ts";

const DIR = import.meta.dirname;
const SOURCE = "snapshots.wacz";
const TARGET = "snapshots-capture-scripts.wacz";

const OLD = "after-behaviors";
const NEW = "after-capture-scripts";
const WACZ_PROFILE = [
  "https://uraitakahito.github.io/browserhive-specs/wacz-profile/1.22.0/",
  "https://uraitakahito.github.io/browserhive-specs/wacz-profile/1.30.0/",
] as const;
const WARC_PROFILE = [
  "https://uraitakahito.github.io/browserhive-warc-spec/1.2.0/",
  "https://uraitakahito.github.io/browserhive-warc-spec/1.8.0/",
] as const;

/** 字を替える。1 つも当たらなければ止める（元の見本が変わったのに気づかずに、何も替えない見本を作らないため） */
const swap = (text: string, from: string, to: string, where: string): string => {
  if (!text.includes(from)) throw new Error(`${where} に ${from} が無い`);
  return text.replaceAll(from, to);
};

const sha256Base32 = (data: Buffer): string => {
  const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  const bytes = createHash("sha256").update(data).digest();
  let bits = 0;
  let value = 0;
  let out = "";
  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += ALPHABET[(value << (5 - bits)) & 31];
  return `sha256:${out}`;
};

/** WARC を gzip の member ごとに分ける。member の終わりは、次の member の頭のうち、そこまでで gunzip が通る最初の所 */
const membersOf = (warc: Buffer): Buffer[] => {
  const members: Buffer[] = [];
  let start = 0;
  while (start < warc.length) {
    let end = warc.indexOf(Buffer.from([0x1f, 0x8b, 0x08]), start + 1);
    for (;;) {
      const stop = end < 0 ? warc.length : end;
      try {
        gunzipSync(warc.subarray(start, stop));
        members.push(warc.subarray(start, stop));
        start = stop;
        break;
      } catch (error) {
        if (end < 0) throw error;
        end = warc.indexOf(Buffer.from([0x1f, 0x8b, 0x08]), end + 1);
      }
    }
  }
  return members;
};

/** レコード 1 つの時点の名と版を替える。替えなければ undefined */
const rewriteRecord = (record: Buffer): Buffer | undefined => {
  const split = record.indexOf("\r\n\r\n");
  const head = record.subarray(0, split).toString("latin1");
  // レコードは見出し・空行・本文・末尾の空行 2 つ（\r\n\r\n）
  const length = Number(/\r\nContent-Length: (\d+)/.exec(head)?.[1]);
  const bodyStart = split + 4;
  const body = record.subarray(bodyStart, bodyStart + length).toString("utf8");
  const tail = record.subarray(bodyStart + length);

  let newBody = body;
  if (head.includes("\r\nWARC-Type: warcinfo\r\n"))
    newBody = swap(body, WARC_PROFILE[0], WARC_PROFILE[1], "warcinfo");
  else if (body.includes(OLD) && head.includes("\r\nWARC-Type: metadata\r\n"))
    newBody = swap(body, OLD, NEW, "metadata");
  else if (body.includes(OLD)) throw new Error("metadata でないレコードの本文に時点の名が在る");
  const newHead = head.replaceAll(OLD, NEW);
  if (newHead === head && newBody === body) return undefined;

  const bodyBytes = Buffer.from(newBody, "utf8");
  let fixedHead = newHead;
  if (newBody !== body) {
    if (head.includes("\r\nWARC-Payload-Digest: "))
      throw new Error("payload の digest を持つレコードの本文は替えない");
    fixedHead = fixedHead
      .replace(/\r\nContent-Length: \d+/, `\r\nContent-Length: ${String(bodyBytes.length)}`)
      .replace(/\r\nWARC-Block-Digest: \S+/, `\r\nWARC-Block-Digest: ${sha256Base32(bodyBytes)}`);
  }
  return Buffer.concat([
    Buffer.from(fixedHead, "latin1"),
    Buffer.from("\r\n\r\n"),
    bodyBytes,
    tail,
  ]);
};

const source = readZip(readFileSync(join(DIR, SOURCE)));
const entryOf = (name: string): Entry => {
  const e = source.find((s) => s.name === name);
  if (!e) throw new Error(`${name} が無い`);
  return e;
};

// WARC: member ごとに替え、索引のために、元の offset から新しい offset と length を引けるようにする
const warcEntry = entryOf("archive/data-000.warc.gz");
const moved = new Map<number, { offset: number; length: number }>();
const members: Buffer[] = [];
let offset = 0;
let oldOffset = 0;
for (const member of membersOf(content(warcEntry))) {
  const rewritten = rewriteRecord(gunzipSync(member));
  const out = rewritten === undefined ? member : gzipSync(rewritten, { level: 9 });
  moved.set(oldOffset, { offset, length: out.length });
  members.push(out);
  oldOffset += member.length;
  offset += out.length;
}
const warc = Buffer.concat(members);

// 索引: 時点の名を替え、offset と length を新しい WARC に合わせ、並べ直す
const index = content(entryOf("indexes/index.cdxj"))
  .toString("utf8")
  .trimEnd()
  .split("\n")
  .map((line) => {
    const space = line.indexOf(" ", line.indexOf(" ") + 1);
    const fields = JSON.parse(line.slice(space + 1)) as Record<string, string>;
    const at = moved.get(Number(fields["offset"]));
    if (at === undefined)
      throw new Error(`索引の offset ${String(fields["offset"])} が member の頭でない`);
    const key = line.slice(0, space).replaceAll(OLD, NEW);
    const url = (fields["url"] ?? "").replaceAll(OLD, NEW);
    return `${key} ${JSON.stringify({ ...fields, url, offset: String(at.offset), length: String(at.length) })}`;
  })
  .toSorted()
  .join("\n");

const changed = new Map<string, Buffer>([
  ["archive/data-000.warc.gz", warc],
  ["indexes/index.cdxj", Buffer.from(index + "\n")],
  [
    "pages/pages.jsonl",
    Buffer.from(
      swap(content(entryOf("pages/pages.jsonl")).toString("utf8"), OLD, NEW, "pages.jsonl"),
    ),
  ],
  [
    "accessibility/axtree.jsonl",
    Buffer.from(
      swap(
        content(entryOf("accessibility/axtree.jsonl")).toString("utf8"),
        OLD,
        NEW,
        "axtree.jsonl",
      ),
    ),
  ],
]);

// datapackage.json: 時点の名と版を替え、替えたエントリの hash と bytes を計り直す
const pkgText = swap(
  swap(content(entryOf("datapackage.json")).toString("utf8"), OLD, NEW, "datapackage.json"),
  WACZ_PROFILE[0],
  WACZ_PROFILE[1],
  "datapackage.json",
);
const pkg = JSON.parse(pkgText) as { resources: { path: string; hash: string; bytes: number }[] };
for (const resource of pkg.resources) {
  const data = changed.get(resource.path);
  if (data === undefined) continue;
  resource.hash = `sha256:${createHash("sha256").update(data).digest("hex")}`;
  resource.bytes = data.length;
}
const pkgBytes = Buffer.from(JSON.stringify(pkg, null, 2) + "\n");
changed.set("datapackage.json", pkgBytes);
const digest = JSON.parse(content(entryOf("datapackage-digest.json")).toString("utf8")) as {
  hash: string;
};
digest.hash = `sha256:${createHash("sha256").update(pkgBytes).digest("hex")}`;
changed.set("datapackage-digest.json", Buffer.from(JSON.stringify(digest, null, 2) + "\n"));

const entries = source.map((e) => {
  const data = changed.get(e.name);
  return data === undefined ? e : replace(e, data);
});
const out = writeZip(entries);
for (const e of readZip(out)) {
  if (content(e).includes(OLD)) throw new Error(`${e.name} に ${OLD} が残った`);
}
writeFileSync(join(DIR, TARGET), out);
