// capture-player: 2026-11-12 に足した。DER の署名を照合できるか（上流は DER のまま WebCrypto に渡し、常に false だった）。
import test from "ava";
import fs from "node:fs";
import * as x509 from "@peculiar/x509";

import { verifyWACZSignature } from "../src/wacz/certutils";

// ブラウザでは x509 が globalThis.crypto を自分で見つける。Node の試験では渡す
x509.cryptoProvider.set(globalThis.crypto);

type SignedData = Parameters<typeof verifyWACZSignature>[0];

async function signatureMatched(name: string): Promise<unknown> {
  const json = JSON.parse(
    fs.readFileSync(`test/data/capture-player/signature-${name}.json`, "utf8"),
  ) as { signedData: SignedData };
  const results = await verifyWACZSignature(json.signedData);
  return results.find((r) => r.id === "signature")?.matched;
}

test("DER の署名を照合できる", async (t) => {
  t.is(await signatureMatched("der"), true);
});

test("1 ビット変えた DER の署名は通らない", async (t) => {
  t.is(await signatureMatched("tampered"), false);
});

test("r‖s の署名は今までどおり通る", async (t) => {
  t.is(await signatureMatched("raw"), true);
});
