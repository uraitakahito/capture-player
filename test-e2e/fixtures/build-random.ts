// 乱数の控え（CAPTURE-378）の e2e の見本の WACZ を、手で組んで書き出す。BrowserHive で撮った物ではない（代役）。
// BrowserHive の e2e が撮った本物に替えるまでの物。
//
//   node test-e2e/fixtures/build-random.ts
//
// 書き出すのは random-pick・random-none・random-twice・random-tampered の 4 本。何度流しても同じバイト列になる
// （時刻・ZIP の日付・UUID を固定している）。中身と、試験が見ることは fixtures/README.md。
import { createHash } from "node:crypto";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { crc32, deflateRawSync, gzipSync } from "node:zlib";

const DIR = import.meta.dirname;
const HOST = "https://fixtures.test";
const PICK = `${HOST}/random/pick`;
const PICK_JS = `${HOST}/random/pick.js`;
const PROFILE = "browserhive:random/1";

const T1 = "2026-11-14T02:10:00.757Z";
const T2 = "2026-11-14T02:20:00.311Z";

const PICK_HTML = `<!doctype html>
<html>
<head><meta charset="utf-8"><title>pick</title></head>
<body>
<script src="/random/pick.js"></script>
</body>
</html>
`;

// capture-fixtures の /random/pick.js と同じ形: Math.random を 1 回引き、0 … 999999 の数の絵を 1 枚足す
const PICK_SRC = `(function () {
  var n = Math.floor(Math.random() * 1e6);
  var img = document.createElement("img");
  img.id = "pick";
  img.alt = "pick " + n;
  img.src = "/random/img/" + n + ".svg";
  document.body.appendChild(img);
  document.title = "pick " + n;
})();
`;

const svg = (n: number) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="160" height="40"><text x="8" y="28" font-size="24">${String(n)}</text></svg>`;

// ---------------------------------------------------------------------------
// WARC と CDXJ

interface Resource {
  url: string;
  date: string;
  mime: string;
  body: string;
}

const BASE32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
const base32 = (buf: Buffer): string => {
  let bits = 0;
  let value = 0;
  let out = "";
  for (const b of buf) {
    value = (value << 8) | b;
    bits += 8;
    while (bits >= 5) {
      out += BASE32[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += BASE32[(value << (5 - bits)) & 31];
  return out;
};
const sha256 = (b: Buffer | string) => createHash("sha256").update(b).digest();

/** 名前から決まる UUID（何度組んでも同じ） */
const uuid = (seed: string): string => {
  const h = sha256(seed).toString("hex");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-8${h.slice(17, 20)}-${h.slice(20, 32)}`;
};

/** `test,fixtures)/random/pick` */
const surt = (url: string): string => {
  const u = new URL(url);
  return `${u.hostname.split(".").reverse().join(",")})${u.pathname}${u.search}`;
};

const ts14 = (iso: string) => iso.replace(/[^0-9]/g, "").slice(0, 14);

interface Built {
  warc: Buffer;
  cdxj: string;
  records: Map<string, string>;
}

const buildWarc = (resources: Resource[]): Built => {
  const parts: Buffer[] = [];
  const lines: string[] = [];
  const records = new Map<string, string>();
  let offset = 0;
  for (const r of resources) {
    const body = Buffer.from(r.body, "utf8");
    const http = Buffer.concat([
      Buffer.from(
        `HTTP/1.1 200 OK\r\nContent-Type: ${r.mime}\r\nContent-Length: ${String(body.length)}\r\n\r\n`,
      ),
      body,
    ]);
    const digest = `sha256:${base32(sha256(body))}`;
    const id = `urn:uuid:${uuid(`${r.url} ${r.date}`)}`;
    records.set(`${r.url} ${r.date}`, id);
    const head =
      `WARC/1.1\r\nWARC-Type: response\r\nWARC-Record-ID: <${id}>\r\nWARC-Date: ${r.date}\r\n` +
      `WARC-Target-URI: ${r.url}\r\nContent-Type: application/http; msgtype=response\r\n` +
      `WARC-Payload-Digest: ${digest}\r\nContent-Length: ${String(http.length)}\r\n\r\n`;
    const record = gzipSync(Buffer.concat([Buffer.from(head), http, Buffer.from("\r\n\r\n")]), {
      level: 9,
    });
    // gzip の見出しの時刻は 0（gzipSync は 0 を書く）・OS の欄だけ揃える
    record[9] = 3;
    parts.push(record);
    lines.push(
      `${surt(r.url)} ${ts14(r.date)} ${JSON.stringify({
        url: r.url,
        mime: r.mime,
        status: "200",
        digest,
        length: String(record.length),
        offset: String(offset),
        filename: "data.warc.gz",
      })}`,
    );
    offset += record.length;
  }
  lines.sort();
  return { warc: Buffer.concat(parts), cdxj: lines.join("\n") + "\n", records };
};

// ---------------------------------------------------------------------------
// ZIP（WACZ）。archive/ は無圧縮（WACZ の決まり）、ほかは deflate

interface Entry {
  name: string;
  data: Buffer;
  store: boolean;
}

const zip = (entries: Entry[]): Buffer => {
  // 2026-11-14 00:00:00 の DOS の日時
  const dosTime = 0;
  const dosDate = ((2026 - 1980) << 9) | (11 << 5) | 14;
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;
  for (const e of entries) {
    const name = Buffer.from(e.name, "utf8");
    const body = e.store ? e.data : deflateRawSync(e.data, { level: 9 });
    const crc = crc32(e.data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0x0800, 6);
    local.writeUInt16LE(e.store ? 0 : 8, 8);
    local.writeUInt16LE(dosTime, 10);
    local.writeUInt16LE(dosDate, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(body.length, 18);
    local.writeUInt32LE(e.data.length, 22);
    local.writeUInt16LE(name.length, 26);
    local.writeUInt16LE(0, 28);
    locals.push(local, name, body);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(0x0314, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0x0800, 8);
    central.writeUInt16LE(e.store ? 0 : 8, 10);
    central.writeUInt16LE(dosTime, 12);
    central.writeUInt16LE(dosDate, 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(body.length, 20);
    central.writeUInt32LE(e.data.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt32LE((0o100644 << 16) >>> 0, 38);
    central.writeUInt32LE(offset, 42);
    centrals.push(central, name);
    offset += 30 + name.length + body.length;
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

// ---------------------------------------------------------------------------
// WACZ

interface Draw {
  document: number;
  value: number;
}
interface Spec {
  name: string;
  /** 撮った文書の時刻（同じ URL を 2 度撮るなら 2 つ） */
  loads: string[];
  /** 絵を残す数 */
  images: number[];
  /** 控え。無ければ random/ を持たず、random.recorded は false */
  draws?: Draw[];
  /** values.jsonl の中身を、hash を計ったあとで変える */
  tamper?: (text: string) => string;
}

const write = (spec: Spec): void => {
  const resources: Resource[] = [];
  for (const date of spec.loads) {
    resources.push({ url: PICK, date, mime: "text/html", body: PICK_HTML });
  }
  const first = spec.loads[0] ?? T1;
  resources.push({ url: PICK_JS, date: first, mime: "text/javascript", body: PICK_SRC });
  for (const n of spec.images) {
    resources.push({
      url: `${HOST}/random/img/${String(n)}.svg`,
      date: first,
      mime: "image/svg+xml",
      body: svg(n),
    });
  }
  const { warc, cdxj, records } = buildWarc(resources);

  const pages =
    [
      JSON.stringify({ format: "json-pages-1.0", id: "pages", title: "All Pages" }),
      ...spec.loads.map((date, i) =>
        JSON.stringify({
          id: uuid(`page ${spec.name} ${String(i)}`),
          url: PICK,
          ts: date,
          title: "pick",
        }),
      ),
    ].join("\n") + "\n";

  const files: Entry[] = [
    { name: "archive/data.warc.gz", data: warc, store: true },
    { name: "indexes/index.cdxj", data: Buffer.from(cdxj), store: false },
    { name: "pages/pages.jsonl", data: Buffer.from(pages), store: false },
  ];

  let random: Record<string, unknown> = { recorded: false, skipped: "not-requested" };
  let valuesText: string | undefined;
  if (spec.draws) {
    const lines: string[] = [];
    spec.loads.forEach((date, document) => {
      lines.push(
        JSON.stringify({
          profile: PROFILE,
          kind: "document",
          document,
          url: PICK,
          frame: "main",
          dpr: 1,
          record: records.get(`${PICK} ${date}`),
          date,
        }),
      );
    });
    const seq = new Map<number, number>();
    for (const d of spec.draws) {
      const s = seq.get(d.document) ?? 0;
      seq.set(d.document, s + 1);
      lines.push(
        JSON.stringify({
          profile: PROFILE,
          kind: "draw",
          document: d.document,
          seq: s,
          api: "Math.random",
          caller: PICK_JS,
          value: d.value,
        }),
      );
    }
    valuesText = lines.join("\n") + "\n";
    random = {
      recorded: true,
      documents: spec.loads.length,
      draws: spec.draws.length,
      truncated: false,
    };
  }

  const resourceRows = files.map((f) => ({
    name: f.name.split("/").pop(),
    path: f.name,
    hash: `sha256:${sha256(f.data).toString("hex")}`,
    bytes: f.data.length,
  }));
  if (valuesText !== undefined) {
    const values = Buffer.from(valuesText);
    const recorder = Buffer.from(
      "// capture-player の e2e の代役の WACZ。BrowserHive の recorder ではない。読み手は走らせない（仕様が禁じる）。\n",
    );
    for (const [name, data] of [
      ["random/values.jsonl", values],
      ["random/recorder.js", recorder],
    ] as const) {
      resourceRows.push({
        name: name.split("/").pop(),
        path: name,
        hash: `sha256:${sha256(data).toString("hex")}`,
        bytes: data.length,
      });
    }
    const stored = spec.tamper ? Buffer.from(spec.tamper(valuesText)) : values;
    if (spec.tamper && stored.equals(values))
      throw new Error(`${spec.name}: tamper が何も変えない`);
    files.push(
      { name: "random/values.jsonl", data: stored, store: false },
      { name: "random/recorder.js", data: recorder, store: false },
    );
  }

  const datapackage = {
    profile: "data-package",
    wacz_version: "1.1.1",
    name: `capture-player-${spec.name}`,
    software: "capture-player test-e2e/fixtures/build-random.ts",
    created: first,
    mainPageURL: PICK,
    mainPageDate: first,
    resources: resourceRows,
    title: "pick",
    "browserhive:capture": {
      conformsTo: "https://uraitakahito.github.io/browserhive-specs/wacz-profile/1.26.0/",
      random,
    },
  };
  files.push({
    name: "datapackage.json",
    data: Buffer.from(JSON.stringify(datapackage, null, 2) + "\n"),
    store: false,
  });

  writeFileSync(join(DIR, `${spec.name}.wacz`), zip(files));
};

// 控えの数は、wombat の固定の種の Math.random が出す数と違う物を選んである（random.test.ts が確かめる）
write({
  name: "random-pick",
  loads: [T1],
  images: [123456],
  draws: [{ document: 0, value: 0.123456789 }],
});
write({ name: "random-none", loads: [T1], images: [123456] });
write({
  name: "random-twice",
  loads: [T1, T2],
  images: [250000, 875000],
  draws: [
    { document: 0, value: 0.2500001 },
    { document: 1, value: 0.8750002 },
  ],
});
write({
  name: "random-tampered",
  loads: [T1],
  images: [333333],
  draws: [{ document: 0, value: 0.3333333 }],
  // 値の最後の 1 字だけ変える（JSON のまま。hash を見ないと 333333 を選ぶ）
  tamper: (text) => text.replace("0.3333333", "0.3333334"),
});
