import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { inventory, compare } from "./check-core-server-facades.mjs";

describe("ratcheted server-adapter Core facade imports", () => {
  it("finds imports and reexports while excluding tests and unrelated packages", () => {
    const base = fs.mkdtempSync(path.join(os.tmpdir(), "gafus-core-facades-"));
    try {
      const write = (name, contents) => {
        const filename = path.join(base, "packages/core/src", name);
        fs.mkdirSync(path.dirname(filename), { recursive: true });
        fs.writeFileSync(filename, contents);
      };
      write("services/payment.ts", [
        'import { pay } from "@gafus/subscription-payment-server";',
        'export { token } from "@gafus/identity-write-server/auth-rows";',
        'import { safe } from "@gafus/types";',
      ].join("\n"));
      write("services/payment.test.ts", 'import { q } from "@gafus/other-server";');
      write("services/unrelated.ts", 'import { x } from "node:crypto";');
      const found = inventory(base);
      assert.equal(found.length, 2);
      assert(found.some(x => x.import === "@gafus/subscription-payment-server"));
      assert(found.some(x => x.import === "@gafus/identity-write-server/auth-rows"));
      assert.equal(compare(found, found).added.length, 0);
      assert.equal(compare(found, found.slice(0, 1)).added.length, 1);
      assert.equal(compare(found.slice(0, 1), found).removed, 1);
    } finally {
      fs.rmSync(base, { recursive: true, force: true });
    }
  });

  it("catches dynamic import, CommonJS, import type and computed import bypasses", () => {
    const base = fs.mkdtempSync(path.join(os.tmpdir(), "gafus-core-import-bypass-"));
    try {
      const filename = path.join(base, "packages/core/src/services/bypass.ts");
      fs.mkdirSync(path.dirname(filename), { recursive: true });
      fs.writeFileSync(filename, [
        'const a = await import("@gafus/identity-write-server/auth-rows");',
        'const b = require(`@gafus/pets-server/pet-rows`);',
        'type C = import("@gafus/gafus-server/wallet-lock").GafusWalletTransaction;',
        'import D = require("@gafus/course-read-server");',
        'export * from "@gafus/feature-flags-server";',
        'const unsafe = await import(variableName);',
      ].join("\n"));
      const found = inventory(base);
      assert.deepEqual(found.map(x => x.import).sort(), [
        "@gafus/identity-write-server/auth-rows",
        "@gafus/pets-server/pet-rows",
        "@gafus/gafus-server/wallet-lock",
        "@gafus/course-read-server",
        "@gafus/feature-flags-server",
        "<computed-module-specifier>",
      ].sort());
      assert.equal(compare(found, []).added.length, 6);
    } finally {
      fs.rmSync(base, { recursive: true, force: true });
    }
  });

  it("blocks an unreviewed direct server dependency in Core Domain", () => {
    const rows = [{ file: "packages/core/src/domain/price.ts", import: "@gafus/gafus-server" }];
    assert.equal(compare(rows, []).added.length, 1);
    assert.equal(compare(rows, rows).domainViolations.length, 1);
  });

  it("counts duplicate new import declarations rather than hiding them in a set", () => {
    const row = { file: "packages/core/src/services/a.ts", import: "@gafus/pets-server" };
    assert.equal(compare([row, row], [row]).added.length, 1);
  });
});
