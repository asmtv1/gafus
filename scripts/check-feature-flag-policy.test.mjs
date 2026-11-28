import { test } from "node:test";
import assert from "node:assert/strict";
import { buildFlagCatalog, readFlagSelectors, compareFlagCatalog } from "./feature-flag-policy-checks.mjs";

const group = { owner: "owner", fallback: "off", removal: "after rollback", keys: ["A_ENABLED"] };

test("literal access including optional chaining and destructuring cannot bypass inventory", () => {
  assert.deepEqual([...readFlagSelectors(`
    process.env.A_ENABLED;
    env["B_DISABLED"];
    import.meta.env?.C_FEATURE;
    process.env?.["D_SHADOW"];
    const { E_ENABLED: renamed, F_MODE = "off", SECRET } = process.env;
    process.env.SECRET;
  `)].sort(), ["A_ENABLED", "B_DISABLED", "C_FEATURE", "D_SHADOW", "E_ENABLED", "F_MODE"]);
});

test("new selectors and stale rules both fail the policy comparison", () => {
  assert.deepEqual(compareFlagCatalog(buildFlagCatalog([group]), new Set(["B_ENABLED"])),
    { missing: ["B_ENABLED"], stale: ["A_ENABLED"] });
});

test("policy rejects duplicates and empty ownership or retirement rules", () => {
  assert.throws(() => buildFlagCatalog([group, group]), /Duplicate flag/);
  for (const field of ["owner", "fallback", "removal"]) {
    assert.throws(() => buildFlagCatalog([{ ...group, [field]: " " }]), /Incomplete flag policy/);
  }
});
