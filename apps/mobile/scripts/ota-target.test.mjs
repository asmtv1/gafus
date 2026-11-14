import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveEasUpdateTarget } from "./native-release-contract.mjs";

test("production target is identical for spaced and joined channel", () => {
  assert.deepEqual(resolveEasUpdateTarget(["--channel", "production", "--environment", "production"]),
    resolveEasUpdateTarget(["--channel=production", "--environment=production"]));
});
test("explicit preview target never has production policy", () => {
  assert.deepEqual(resolveEasUpdateTarget(["--channel=preview", "--environment", "preview"]),
    { channel:"preview", environment:"preview", viaBranch:false });
});
test("existing verified EAS main branch maps to production preflight", () => {
  assert.deepEqual(resolveEasUpdateTarget(["--branch", "main", "--environment", "production"]),
    { channel:"production", environment:"production", viaBranch:true });
});
test("ambiguous or conflicting targets are refused before network", () => {
  for (const args of [[], ["--branch", "preview"], ["--channel"],
    ["--channel", "preview", "--channel=production"],
    ["--branch", "main", "--channel=production"],
    ["--channel=production", "--environment=preview"]]) {
    assert.throws(() => resolveEasUpdateTarget(args), /MOBILE_OTA_/);
  }
});
