import assert from "node:assert/strict";
import { test } from "node:test";
import path from "node:path";
import ts from "typescript";
import { findForbiddenCoreImports } from "./check-mobile-core-boundary.mjs";

test("Expo routes cannot import server Core through a package or relative path", () => {
  const file = path.resolve("apps/mobile/app/example.tsx");
  const source = ts.createSourceFile(file, [
    'import "@gafus/core/utils";',
    'export * from "../../../packages/core/src/utils";',
    'const lazy = import("@gafus/core/services/pets", { with: {} });',
    'type Hidden = import("@gafus/core/validation/pet").Pet;',
    'const res = require.resolve("@gafus/core");',
    'import legacy = require("@gafus/core");',
    'import "@gafus/core-client/utils";',
  ].join("\n"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  assert.equal(findForbiddenCoreImports(source, file).length, 6);
});
