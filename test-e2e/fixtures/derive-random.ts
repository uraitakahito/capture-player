// e2e の見本のうち、本物（BrowserHive の e2e が撮った random-pick.wacz）から作る物を書き出す。
//
//   node test-e2e/fixtures/derive-random.ts
//
// 乱数の記録（CAPTURE-378）の 2 本:
// - random-none.wacz: random/values.jsonl・random/recorder.js と、その resources の行と、
//   browserhive:capture.random を抜いた物（no-browserhive.wacz と同じく、datapackage-digest.json の hash は
//   合わなくなる）
// - random-tampered.wacz: random/values.jsonl の値の 1 字だけを変え、resources の hash はそのままにした物
//
// 頁の一覧の絵（CAPTURE-440）の 2 本。どちらも after-load の節目のスクリーンショットの扱いだけを替える
// （resources の hash は合わなくなる）:
// - thumbnail-only.wacz: 上流の名前の絵（urn:thumbnail:<頁の url>）だけを持つ WACZ。絵のレコードを写して
//   WARC-Target-URI だけを替えた物を WARC の後ろに足し、索引の絵の行をそれを指す行に替える。wabac.js は索引の url と
//   レコードの WARC-Target-URI が違うと読まない（remotearchivedb.ts の「Wrong url」）ので、索引だけは替えられない。
//   元の絵のレコードは WARC に残るが、索引から引けない
// - bucket/thumbnails/pick-no-shot.wacz: 索引から絵の行を抜いた物（絵の無い回。WARC は替えない）
//
// 変えないエントリは、元の ZIP の圧縮したバイト列をそのまま写す。何度流しても同じバイト列になる。
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { crc32, deflateRawSync, gunzipSync, gzipSync, inflateRawSync } from "node:zlib";

const DIR = import.meta.dirname;
const SOURCE = "random-pick.wacz";

interface Entry {
  name: string;
  method: number;
  time: number;
  date: number;
  crc: number;
  size: number;
  /** ZIP の中の（圧縮した）バイト列 */
  raw: Buffer;
}

/** 中央ディレクトリから読む（data descriptor を使う ZIP でも大きさは中央ディレクトリにある） */
const readZip = (zip: Buffer): Entry[] => {
  const eocd = zip.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  if (eocd < 0) throw new Error("ZIP の終わりが無い");
  const count = zip.readUInt16LE(eocd + 10);
  let p = zip.readUInt32LE(eocd + 16);
  const entries: Entry[] = [];
  for (let i = 0; i < count; i++) {
    if (zip.readUInt32LE(p) !== 0x02014b50) throw new Error("中央ディレクトリが読めない");
    const method = zip.readUInt16LE(p + 10);
    const time = zip.readUInt16LE(p + 12);
    const date = zip.readUInt16LE(p + 14);
    const crc = zip.readUInt32LE(p + 16);
    const compressed = zip.readUInt32LE(p + 20);
    const size = zip.readUInt32LE(p + 24);
    const nameLen = zip.readUInt16LE(p + 28);
    const extraLen = zip.readUInt16LE(p + 30);
    const commentLen = zip.readUInt16LE(p + 32);
    const local = zip.readUInt32LE(p + 42);
    const name = zip.toString("utf8", p + 46, p + 46 + nameLen);
    const start = local + 30 + zip.readUInt16LE(local + 26) + zip.readUInt16LE(local + 28);
    entries.push({
      name,
      method,
      time,
      date,
      crc,
      size,
      raw: zip.subarray(start, start + compressed),
    });
    p += 46 + nameLen + extraLen + commentLen;
  }
  return entries;
};

const content = (e: Entry): Buffer => (e.method === 8 ? inflateRawSync(e.raw) : e.raw);

const replace = (e: Entry, data: Buffer): Entry => ({
  ...e,
  crc: crc32(data),
  size: data.length,
  raw: e.method === 8 ? deflateRawSync(data, { level: 9 }) : data,
});

/** data descriptor を使わない形で書く */
const writeZip = (entries: Entry[]): Buffer => {
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;
  for (const e of entries) {
    const name = Buffer.from(e.name, "utf8");
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0x0800, 6);
    local.writeUInt16LE(e.method, 8);
    local.writeUInt16LE(e.time, 10);
    local.writeUInt16LE(e.date, 12);
    local.writeUInt32LE(e.crc, 14);
    local.writeUInt32LE(e.raw.length, 18);
    local.writeUInt32LE(e.size, 22);
    local.writeUInt16LE(name.length, 26);
    locals.push(local, name, e.raw);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(0x0314, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0x0800, 8);
    central.writeUInt16LE(e.method, 10);
    central.writeUInt16LE(e.time, 12);
    central.writeUInt16LE(e.date, 14);
    central.writeUInt32LE(e.crc, 16);
    central.writeUInt32LE(e.raw.length, 20);
    central.writeUInt32LE(e.size, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt32LE((0o100644 << 16) >>> 0, 38);
    central.writeUInt32LE(offset, 42);
    centrals.push(central, name);
    offset += 30 + name.length + e.raw.length;
  }
  const cd = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(cd.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, cd, end]);
};

const RANDOM = ["random/values.jsonl", "random/recorder.js"];
const source = readZip(readFileSync(join(DIR, SOURCE)));
const pkgEntry = source.find((e) => e.name === "datapackage.json");
if (!pkgEntry) throw new Error("datapackage.json が無い");

// random-none
{
  const pkg = JSON.parse(content(pkgEntry).toString("utf8")) as {
    resources: { path: string }[];
    "browserhive:capture": Record<string, unknown>;
  };
  pkg.resources = pkg.resources.filter((r) => !RANDOM.includes(r.path));
  delete pkg["browserhive:capture"]["random"];
  const entries = source
    .filter((e) => !RANDOM.includes(e.name))
    .map((e) =>
      e === pkgEntry ? replace(e, Buffer.from(JSON.stringify(pkg, null, 2) + "\n")) : e,
    );
  writeFileSync(join(DIR, "random-none.wacz"), writeZip(entries));
}

// random-tampered
{
  const values = source.find((e) => e.name === "random/values.jsonl");
  if (!values) throw new Error("random/values.jsonl が無い");
  const text = content(values).toString("utf8");
  // Math.random の値の最後の 1 字を変える（JSON のまま。n = floor(値 × 1e6) は変わらない）
  const m = /"value":(0\.\d+)\}/.exec(text);
  if (!m?.[1]) throw new Error("値が見つからない");
  const value = m[1];
  const last = value.at(-1) === "1" ? "2" : "1";
  const changed = text.replace(`"value":${value}}`, `"value":${value.slice(0, -1)}${last}}`);
  if (changed.length !== text.length || changed === text) throw new Error("1 字だけ変わっていない");
  const entries = source.map((e) => (e === values ? replace(e, Buffer.from(changed)) : e));
  writeFileSync(join(DIR, "random-tampered.wacz"), writeZip(entries));
}

// thumbnail-only・pick-no-shot: after-load の節目のスクリーンショットを替える
{
  const index = source.find((e) => e.name === "indexes/index.cdxj");
  if (!index) throw new Error("indexes/index.cdxj が無い");
  const lines = content(index).toString("utf8").trimEnd().split("\n");
  const SHOT = "urn:browserhive:screenshot:after-load:";
  const shots = lines.filter((l) => l.startsWith(SHOT));
  const shot = shots[0];
  if (shots.length !== 1 || shot === undefined) throw new Error("絵の行が 1 つでない");
  const rest = lines.filter((l) => l !== shot);
  const indexOf = (kept: string[]): Entry =>
    replace(index, Buffer.from(kept.toSorted().join("\n") + "\n"));

  // pick-no-shot
  writeFileSync(
    join(DIR, "bucket", "thumbnails", "pick-no-shot.wacz"),
    writeZip(source.map((e) => (e === index ? indexOf(rest) : e))),
  );

  // thumbnail-only
  const space = shot.indexOf(" ", shot.indexOf(" ") + 1);
  const fields = JSON.parse(shot.slice(space + 1)) as {
    url: string;
    offset: string;
    length: string;
    filename: string;
  };
  const warc = source.find((e) => e.name === `archive/${fields.filename}`);
  if (!warc) throw new Error(`archive/${fields.filename} が無い`);
  const warcBytes = content(warc);
  const offset = Number(fields.offset);
  const record = gunzipSync(warcBytes.subarray(offset, offset + Number(fields.length)));
  const head = record.subarray(0, record.indexOf("\r\n\r\n")).toString("latin1");
  const target = `WARC-Target-URI: ${fields.url}\r\n`;
  if (head.split(target).length !== 2)
    throw new Error("絵のレコードの WARC-Target-URI が 1 つでない");
  const pageUrl = fields.url.slice(SHOT.length);
  const thumbnail = `urn:thumbnail:${pageUrl}`;
  const renamedRecord = Buffer.concat([
    Buffer.from(head.replace(target, `WARC-Target-URI: ${thumbnail}\r\n`), "latin1"),
    record.subarray(head.length),
  ]);
  const member = gzipSync(renamedRecord, { level: 9 });
  const line = [
    thumbnail,
    shot.slice(shot.indexOf(" ") + 1, space),
    JSON.stringify({
      ...fields,
      url: thumbnail,
      offset: String(warcBytes.length),
      length: String(member.length),
    }),
  ].join(" ");
  writeFileSync(
    join(DIR, "thumbnail-only.wacz"),
    writeZip(
      source.map((e) =>
        e === index
          ? indexOf([...rest, line])
          : e === warc
            ? replace(e, Buffer.concat([warcBytes, member]))
            : e,
      ),
    ),
  );
}
