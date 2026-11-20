import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { audit } from "./check-architecture-layers.mjs";
describe("architecture import boundaries", () => {
  it("rejects direct Prisma in API routes and infrastructure in domain/application", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "gafus-arch-"));
    try {
      const write = (file, value) => {
        const full = path.join(root, file);
        fs.mkdirSync(path.dirname(full), { recursive: true });
        fs.writeFileSync(full, value);
      };
      write("apps/api/src/routes/v1/invalid.ts", 'import { prisma } from "@gafus/prisma";');
      write("packages/demo/src/domain/d.ts", 'import { Redis } from "ioredis";');
      write("packages/demo/src/application/a.ts", 'import { Hono } from "hono";');
      write("packages/core/package.json", JSON.stringify({name:"@gafus/core",dependencies:{"@gafus/prisma":"workspace:*"}}));
      write("packages/a/package.json", JSON.stringify({name:"@gafus/a",dependencies:{"@gafus/b":"workspace:*"}}));
      write("packages/b/package.json", JSON.stringify({name:"@gafus/b",dependencies:{"@gafus/a":"workspace:*"}}));
      const rules = new Set(audit(root).map(x => x.rule));
      assert(rules.has("route-prisma"));
      assert(rules.has("domain-infrastructure"));
      assert(rules.has("application-infrastructure"));
      assert(rules.has("workspace-dependency-cycle"));
      assert(rules.has("core-production-prisma-dependency"));
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});


it("rejects bypasses through dynamic/template imports, reexports, and nonliteral resolution", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "gafus-arch-import-bypass-"));
  try {
    const write = (file, value) => {
      const full = path.join(root, file);
      fs.mkdirSync(path.dirname(full), { recursive: true });
      fs.writeFileSync(full, value);
    };
    write("apps/api/src/routes/v1/dynamic.ts", [
      'const p = await import(`@gafus/prisma`);',
      'const other = await import(suppliedModule);',
    ].join("\n"));
    write("packages/demo/src/domain/infra.ts", 'const db = require(`ioredis`);');
    write("packages/demo/src/application/infra.ts", [
      'export { adapter } from "@gafus/private/hidden";',
      'const api = await import(`hono`);',
    ].join("\n"));
    write("packages/private/package.json", JSON.stringify({
      name: "@gafus/private", exports: { ".": "./dist/index.js" },
    }));
    const findings = audit(root);
    for (const rule of ["route-prisma", "computed-module-import", "domain-infrastructure",
      "application-infrastructure", "private-package-import"]) {
      assert(findings.some(x => x.rule === rule), `expected ${rule}`);
    }
    assert.equal(findings.filter(x => x.rule === "computed-module-import").length, 1);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

it("Prisma generator cannot restore a stale client from an external pnpm store", () => {
  const projectRoot = path.resolve(import.meta.dirname, "..");
  const manifest = JSON.parse(fs.readFileSync(path.join(projectRoot, "turbo.json"), "utf8"));
  const generate = manifest.tasks["prisma:generate"];
  assert.equal(generate.cache, false, "Prisma client is generated outside Turbo's workspace output root");
  assert.deepEqual(generate.outputs, [], "no unverifiable ../../node_modules artifacts");
  assert(generate.inputs.includes("schema.prisma"), "real packages/prisma/schema.prisma must invalidate build");
  assert(!generate.inputs.includes("prisma/schema.prisma"), "outdated relative path is not the schema");
});


// The boundary applies to config entrypoints too: importing a sibling QA tree
// from a package config must fail rather than bypassing the production ratchet.
it("rejects cross-package relative imports in package Vitest configurations", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "gafus-vitest-boundary-"));
  try {
    const file = path.join(root, "packages", "example", "vitest.config.ts");
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, 'import { unitExclude } from "../../tests/config/vitest/shared";');
    assert(audit(root).some(({ rule, file }) =>
      rule === "cross-package-relative" && file === "packages/example/vitest.config.ts"));
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
  const liveRoot = path.resolve(import.meta.dirname, "..");
  assert(!audit(liveRoot).some(({ rule, file }) =>
    rule === "cross-package-relative" && file === "packages/core/vitest.config.ts"));
});
