# capture-player の試験の見本

capture-player: 2026-11-12 に足した。

`signature-*.json` は、BrowserHive WACZ の `datapackage.json` の hash に、wacz-signer v0.9.0 の CLI
（`init --domain signer.example.invalid` → `sign --file <絶対パス>`、TSA なし）で署名した `datapackage-digest.json`。

- `signature-der.json` — wacz-signer が出した DER（ASN.1・71 バイト）の署名のまま
- `signature-tampered.json` — DER の署名の 11 バイト目の 1 ビットを反転した物
- `signature-raw.json` — 同じ署名を r‖s（64 バイト）に書き直した物

証明書は試験のためだけの自己署名の CA が出した物で、何も信頼しない。
