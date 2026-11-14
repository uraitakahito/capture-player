// capture-player: 2026-11-12 に足した。BrowserHive WACZ Profile の datapackage.json の欄 `browserhive:capture` を、
// Archive Info に出す小さな要約にする。URL の一覧や証明書は大きくなりうるので、数と最初の数件だけを持つ。

export type BrowserHiveSummary = {
  profile?: string;
  build?: string;
  browser?: string;
  document?: string;
  snapshots: string[];
  signature?: string;
  viewport?: string;
  complete?: boolean;
  bodyless: number;
  truncated: number;
  unintercepted: number;
  crashed: number;
  examples: string[];
};

const str = (v: unknown): string | undefined =>
  typeof v === "string" && v ? v : undefined;
const obj = (v: unknown): Record<string, unknown> =>
  v && typeof v === "object" ? (v as Record<string, unknown>) : {};
const list = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);

export function summarizeBrowserHive(
  capture: unknown,
): BrowserHiveSummary | undefined {
  if (!capture || typeof capture !== "object") {
    return undefined;
  }
  const c = obj(capture);
  const build = obj(c["build"]);
  const settings = obj(c["settings"]);
  const viewport = obj(settings["viewport"]);
  const completeness = obj(c["completeness"]);
  const truncatedUrls = list(completeness["truncatedUrls"]);
  const bodylessUrls = list(completeness["bodylessUrls"]);
  const dprs = list(settings["devicePixelRatios"]).join(", ");
  return {
    profile: str(c["conformsTo"]),
    build: str(build["version"])
      ? `${String(build["version"])}${str(build["revision"]) ? ` (${String(build["revision"])})` : ""}`
      : undefined,
    browser: str(obj(c["browser"])["product"]),
    document: str(obj(c["document"])["url"]),
    snapshots: list(c["snapshots"])
      .map((s) => str(obj(s)["stage"]))
      .filter((s): s is string => s !== undefined),
    signature: str(settings["signature"]),
    viewport:
      typeof viewport["width"] === "number" &&
      typeof viewport["height"] === "number"
        ? `${viewport["width"]}×${viewport["height"]}${dprs ? ` @ ${dprs}x` : ""}`
        : undefined,
    complete:
      typeof completeness["complete"] === "boolean"
        ? completeness["complete"]
        : undefined,
    bodyless: bodylessUrls.length,
    truncated: truncatedUrls.length,
    unintercepted: list(completeness["uninterceptedUrls"]).length,
    crashed: list(completeness["crashedTargets"]).length,
    examples: [...truncatedUrls, ...bodylessUrls]
      .map((u) => str(u))
      .filter((u): u is string => u !== undefined)
      .slice(0, 3),
  };
}
