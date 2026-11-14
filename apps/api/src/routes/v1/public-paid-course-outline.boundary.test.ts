import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const routePath = fileURLToPath(new URL("./public-paid-course-outline.ts", import.meta.url));
const applicationPath = fileURLToPath(new URL("../../modules/courses/application/read-public-outline.ts", import.meta.url));
const compositionPath = fileURLToPath(new URL("../../modules/courses/composition/read-public-outline.ts", import.meta.url));
const corePolicyPath = fileURLToPath(new URL("../../../../../packages/core/src/services/course/publicOutlinePolicy.ts", import.meta.url));

function runtimeImports(path: string): string[] {
  const src = ts.createSourceFile(path, readFileSync(path, "utf8"), ts.ScriptTarget.Latest, true);
  return src.statements.filter(ts.isImportDeclaration)
    .filter(node => !node.importClause?.isTypeOnly)
    .map(node => (node.moduleSpecifier as ts.StringLiteral).text);
}

describe("anonymous marketing outline HTTP -> Application -> pure Core", () => {
  it("Hono only binds Application, not Core/Prisma/server packages", () => {
    expect(runtimeImports(routePath)).toEqual([
      "hono", "../../modules/courses/composition/read-public-outline.js",
    ]);
  });
  it("Application owns only erased Core types; composition injects the pure public policy", () => {
    expect(runtimeImports(applicationPath)).toEqual([]);
    expect(runtimeImports(compositionPath)).toEqual([
      "@gafus/core/services/course",
      "@gafus/core/services/course/publicOutlinePolicy",
      "../application/read-public-outline.js",
    ]);
    expect(runtimeImports(corePolicyPath)).toEqual([]);
  });
});
