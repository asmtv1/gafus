import { test } from "node:test";
import assert from "node:assert/strict";
import { canonicalG05Ag3ReceiptPath } from "./g05-web-gate.mjs";

const historic = "apps/mobile/docs/refactor/AG3_G05_RESOURCE_DONE_CANONICAL_WEB_V1_20261017.json";
const relocated = "docs/archive/agents/receipts/mobile-g05/AG3_G05_RESOURCE_DONE_CANONICAL_WEB_V1_20261017.json";

test("G05 historical receipt pin resolves to its exact checksum-preserved path", () => {
  assert.equal(canonicalG05Ag3ReceiptPath(historic), relocated);
  assert.equal(canonicalG05Ag3ReceiptPath(relocated), relocated);
});

test("G05 arbitrary, traversed, or other-file receipt pins are denied", () => {
  for(const p of [undefined, null, "", "../docs/", "docs/archive/agents/receipts/mobile-g05/other.json", "apps/mobile/docs/refactor/evidence/old.log"])
    assert.throws(() => canonicalG05Ag3ReceiptPath(p), /G05_WEB_GATE_DENIED/);
});
