import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { inspectIosPaymentExport } from "./verify-ios-payment-export.mjs";

test("standard iOS export rejects both checkout and registration promo endpoints", (t) => {
  const root = mkdtempSync(path.join(tmpdir(), "gafus-ios-standard-payment-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  writeFileSync(path.join(root, "metadata.json"), JSON.stringify({
    fileMetadata: { ios: { bundle: "main.hbc", assets: [] } },
  }));
  const bundle = path.join(root, "main.hbc");
  writeFileSync(bundle, Buffer.alloc(1024));
  assert.equal(inspectIosPaymentExport(root).sizeBytes, 1024);
  for (const token of ["/yookassa/start", "/promo-code/preview", "/registration-promo-preview"]) {
    writeFileSync(bundle, Buffer.concat([Buffer.alloc(1024), Buffer.from(token)]));
    assert.throws(() => inspectIosPaymentExport(root), /IOS_EXPO_CHECKOUT_GRAPH_FORBIDDEN/);
  }
});
