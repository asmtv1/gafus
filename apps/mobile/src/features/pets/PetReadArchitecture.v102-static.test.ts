// @vitest-environment node
/** V102: AST-only checks on three Mobile production read modules.
 * This test uses Node/TypeScript; neither is imported by the application.
 */
import { readFileSync, realpathSync } from "node:fs";
import { builtinModules } from "node:module";
import path from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";

type ReadRole = "pure" | "composed";
type ReadNode = { role: ReadRole; pure: readonly string[]; runtime: readonly string[] };
const rules: Record<string, ReadNode> = {
  "src/shared/lib/api/petsReadValidation.ts": {
    role: "pure",
    pure: ["validatedPetsForActor", "validatedPetDetailForActor"],
    runtime: [],
  },
  "src/features/pets/petWeightRead.ts": {
    role: "composed",
    pure: ["validateWeightHistory"],
    runtime: [
      "@/shared/stores/authStore",
      "@/shared/lib/tracer",
      "@/shared/lib/offline/newOnlyV2Native",
      "@/shared/lib/api/pets",
    ],
  },
  "src/features/pets/vetVisitsRead.ts": {
    role: "composed",
    pure: ["publicOwnVetVisit", "validVetId"],
    runtime: [
      "@/shared/stores/authStore",
      "@/shared/lib/offline/newOnlyV2Native",
      "@/shared/lib/api/pet-vet-visits",
      "@gafus/types",
    ],
  },
};
const builtins = new Set(builtinModules.map((name) => name.replace(/^node:/, "")));
const unsafeGlobals = new Set([
  "require",
  "fetch",
  "XMLHttpRequest",
  "WebSocket",
  "localStorage",
  "sessionStorage",
  "globalThis",
  "window",
  "document",
  "process",
  "NativeModules",
  "AsyncStorage",
  "SecureStore",
  "FileSystem",
  "StreamChat",
  "setTimeout",
  "setInterval",
]);
const permittedPureConstants = new Map([["@gafus/types", new Set(["VET_VISIT_MIME_TYPES"])]]);
const forbiddenServer = (spec: string): boolean =>
  spec === "@gafus/core" ||
  spec.startsWith("@gafus/core/") ||
  spec === "@gafus/prisma" ||
  spec.startsWith("@gafus/prisma/") ||
  spec === "@prisma/client" ||
  spec.startsWith("@prisma/") ||
  spec === "next" ||
  spec.startsWith("next/") ||
  spec.startsWith("node:") ||
  builtins.has(spec.split("/")[0] ?? "");
const forbiddenProvider = (spec: string): boolean =>
  spec === "expo-secure-store" ||
  spec === "expo-file-system" ||
  spec === "@react-native-async-storage/async-storage" ||
  spec.startsWith("@voximplant/") ||
  spec.startsWith("stream-chat") ||
  spec.startsWith("@aws-sdk/") ||
  spec.startsWith("firebase");
type ModuleImport = {
  from: string;
  names: readonly string[];
  bound: readonly string[];
  runtime: boolean;
  sideEffect: boolean;
};
type Checked = {
  errors: string[];
  edges: Record<string, string[]>;
  imports: Record<string, ModuleImport[]>;
};
function importBindings(node: ts.ImportDeclaration): ModuleImport {
  const from = ts.isStringLiteral(node.moduleSpecifier) ? node.moduleSpecifier.text : "";
  const clause = node.importClause;
  if (!clause) return { from, names: [], bound: [], runtime: true, sideEffect: true };
  if (clause.isTypeOnly) return { from, names: [], bound: [], runtime: false, sideEffect: false };
  const items: { name: string; bound: string }[] = [];
  if (clause.name) items.push({ name: "default", bound: clause.name.text });
  if (clause.namedBindings && ts.isNamespaceImport(clause.namedBindings))
    items.push({ name: "*", bound: clause.namedBindings.name.text });
  if (clause.namedBindings && ts.isNamedImports(clause.namedBindings))
    for (const spec of clause.namedBindings.elements)
      if (!spec.isTypeOnly)
        items.push({ name: spec.propertyName?.text ?? spec.name.text, bound: spec.name.text });
  return {
    from,
    names: items.map((x) => x.name),
    bound: items.map((x) => x.bound),
    runtime: items.length > 0,
    sideEffect: false,
  };
}
function resolveNode(from: string, spec: string, sources: Record<string, string>): string | null {
  if (!spec.startsWith("./") && !spec.startsWith("../") && !spec.startsWith("@/")) return null;
  const target = spec.startsWith("@/")
    ? path.posix.join("src", spec.slice(2))
    : path.posix.normalize(path.posix.join(path.posix.dirname(from), spec));
  if (
    target.startsWith("../") ||
    target === ".." ||
    target.startsWith("/") ||
    (!target.startsWith("src/") && target !== "src")
  )
    return "!ESCAPE!";
  for (const item of [target, `${target}.ts`, `${target}.tsx`, `${target}/index.ts`])
    if (Object.prototype.hasOwnProperty.call(sources, item)) return item;
  return null;
}
function declaredValues(file: ts.SourceFile): Map<string, ts.Node> {
  const found = new Map<string, ts.Node>();
  for (const stmt of file.statements) {
    if (ts.isFunctionDeclaration(stmt) && stmt.name && stmt.body)
      found.set(stmt.name.text, stmt.body);
    if (ts.isVariableStatement(stmt))
      for (const decl of stmt.declarationList.declarations)
        if (ts.isIdentifier(decl.name) && decl.initializer)
          found.set(decl.name.text, decl.initializer);
  }
  return found;
}
function identifiers(node: ts.Node): string[] {
  const names: string[] = [];
  const visit = (item: ts.Node) => {
    if (
      ts.isIdentifier(item) &&
      !(ts.isPropertyAccessExpression(item.parent) && item.parent.name === item) &&
      !(ts.isPropertyAssignment(item.parent) && item.parent.name === item)
    )
      names.push(item.text);
    ts.forEachChild(item, visit);
  };
  visit(node);
  return names;
}
function hasImportEffect(node: ts.Node): boolean {
  if (ts.isArrowFunction(node) || ts.isFunctionExpression(node) || ts.isFunctionDeclaration(node))
    return false;
  if (
    ts.isCallExpression(node) ||
    ts.isNewExpression(node) ||
    ts.isAwaitExpression(node) ||
    ts.isTaggedTemplateExpression(node)
  )
    return true;
  return ts.forEachChild(node, hasImportEffect) === true;
}
/** Only local read nodes participate in cycle detection; verified authStore,
 * apiClient and native queue modules are ALLOWED composition leaves. This is
 * intentionally NOT a ban on their own native storage implementation.
 */
function inspectReadModules(
  sources: Record<string, string>,
  scope: Record<string, ReadNode>,
): Checked {
  const errors: string[] = [];
  const edges: Record<string, string[]> = {};
  const imports: Record<string, ModuleImport[]> = {};
  for (const [filename, rule] of Object.entries(scope)) {
    edges[filename] = [];
    imports[filename] = [];
    const source = sources[filename];
    if (source === undefined) {
      errors.push(`MISSING:${filename}`);
      continue;
    }
    const file = ts.createSourceFile(
      filename,
      source,
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TS,
    );
    const parse = ts.transpileModule(source, {
      fileName: filename,
      reportDiagnostics: true,
      compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ESNext },
    });
    for (const error of parse.diagnostics ?? [])
      if (error.category === ts.DiagnosticCategory.Error)
        errors.push(`PARSE:${filename}:${error.start ?? 0}`);
    const imported = new Map<string, { from: string; name: string }>();
    const checkImport = (ref: ModuleImport) => {
      imports[filename]!.push(ref);
      if (!ref.runtime) return;
      if (ref.sideEffect) errors.push(`SIDE_EFFECT_IMPORT:${filename}:${ref.from}`);
      if (forbiddenServer(ref.from)) errors.push(`SERVER_RUNTIME:${filename}:${ref.from}`);
      if (forbiddenProvider(ref.from)) errors.push(`PROVIDER_RUNTIME:${filename}:${ref.from}`);
      if (
        ref.from === "@gafus/types" &&
        ref.names.some((name) => !permittedPureConstants.get(ref.from)?.has(name))
      )
        errors.push(`UNSAFE_TYPES_RUNTIME:${filename}:${ref.names.join(",")}`);
      if (rule.role === "pure" && ref.from !== "@gafus/types")
        errors.push(`PURE_RUNTIME_IMPORT:${filename}:${ref.from}`);
      if (
        !rule.runtime.includes(ref.from) &&
        !(rule.role === "pure" && ref.from === "@gafus/types")
      )
        errors.push(`UNAPPROVED_RUNTIME:${filename}:${ref.from}`);
      const target = resolveNode(filename, ref.from, sources);
      if (target === "!ESCAPE!") errors.push(`SOURCE_ESCAPE:${filename}:${ref.from}`);
      else if (target && scope[target]) edges[filename]!.push(target);
      for (let i = 0; i < ref.bound.length; i++)
        imported.set(ref.bound[i]!, {
          from: ref.from,
          name: ref.names[i]!,
        });
    };
    for (const stmt of file.statements) {
      if (ts.isImportDeclaration(stmt)) checkImport(importBindings(stmt));
      if (
        ts.isExportDeclaration(stmt) &&
        stmt.moduleSpecifier &&
        ts.isStringLiteral(stmt.moduleSpecifier)
      ) {
        const from = stmt.moduleSpecifier.text;
        const specs =
          stmt.exportClause && ts.isNamedExports(stmt.exportClause)
            ? stmt.exportClause.elements
            : [];
        const isRuntime =
          !stmt.isTypeOnly && (specs.length === 0 || specs.some((x) => !x.isTypeOnly));
        checkImport({ from, names: [], bound: [], runtime: isRuntime, sideEffect: false });
      }
      if (
        ts.isImportEqualsDeclaration(stmt) &&
        ts.isExternalModuleReference(stmt.moduleReference)
      ) {
        const ref = stmt.moduleReference.expression;
        if (ref && ts.isStringLiteral(ref))
          checkImport({
            from: ref.text,
            names: ["*"],
            bound: [stmt.name.text],
            runtime: !stmt.isTypeOnly,
            sideEffect: false,
          });
      }
      if (ts.isExpressionStatement(stmt) && hasImportEffect(stmt.expression))
        errors.push(`IMPORT_TIME_EFFECT:${filename}`);
      if (ts.isVariableStatement(stmt))
        for (const decl of stmt.declarationList.declarations)
          if (decl.initializer && hasImportEffect(decl.initializer))
            errors.push(`IMPORT_TIME_EFFECT:${filename}`);
      if (ts.isExportAssignment(stmt) && hasImportEffect(stmt.expression))
        errors.push(`IMPORT_TIME_EFFECT:${filename}`);
      if (
        ts.isClassDeclaration(stmt) &&
        stmt.members.some((member) => ts.isClassStaticBlockDeclaration(member))
      )
        errors.push(`IMPORT_TIME_STATIC_BLOCK:${filename}`);
    }
    const walk = (node: ts.Node) => {
      if (
        ts.isCallExpression(node) &&
        ((ts.isIdentifier(node.expression) && node.expression.text === "require") ||
          node.expression.kind === ts.SyntaxKind.ImportKeyword)
      )
        errors.push(`DYNAMIC_OR_REQUIRE:${filename}`);
      ts.forEachChild(node, walk);
    };
    walk(file);
    const declarations = declaredValues(file);
    for (const fn of rule.pure) {
      if (!declarations.has(fn)) {
        errors.push(`MISSING_PURE_FUNCTION:${filename}:${fn}`);
        continue;
      }
      const seen = new Set<string>();
      const queue = [fn];
      while (queue.length) {
        const name = queue.pop()!;
        if (seen.has(name)) continue;
        seen.add(name);
        const body = declarations.get(name);
        if (!body) continue;
        for (const reference of identifiers(body)) {
          if (unsafeGlobals.has(reference))
            errors.push(`PURE_GLOBAL:${filename}:${fn}:${reference}`);
          const direct = imported.get(reference);
          if (direct && !permittedPureConstants.get(direct.from)?.has(direct.name))
            errors.push(`PURE_RUNTIME_DEP:${filename}:${fn}:${direct.from}:${direct.name}`);
          if (declarations.has(reference) && !seen.has(reference)) queue.push(reference);
        }
      }
    }
  }
  const state = new Map<string, number>();
  const stack: string[] = [];
  const visit = (n: string) => {
    if (state.get(n) === 2) return;
    if (state.get(n) === 1) {
      errors.push(`RUNTIME_CYCLE:${[...stack, n].join(" -> ")}`);
      return;
    }
    state.set(n, 1);
    stack.push(n);
    for (const next of edges[n] ?? []) visit(next);
    stack.pop();
    state.set(n, 2);
  };
  for (const node of Object.keys(scope)) visit(node);
  return { errors: [...new Set(errors)].sort(), edges, imports };
}
const mobileRoot = path.resolve(process.cwd());
function currentSources(): Record<string, string> {
  const physical = realpathSync(mobileRoot);
  // The checkout folder name differs between local Refactor and GitHub CI.
  // Verify the actual workspace structure and package identity instead of an
  // absolute developer-machine path; continue to reject symlink escapes.
  const workspaceRoot = path.resolve(physical, "../..");
  if (
    path.basename(physical) !== "mobile" ||
    path.basename(path.dirname(physical)) !== "apps" ||
    realpathSync(path.join(workspaceRoot, "apps/mobile")) !== physical ||
    JSON.parse(readFileSync(path.join(physical, "package.json"), "utf8")).name !== "@gafus/mobile" ||
    !readFileSync(path.join(workspaceRoot, "pnpm-workspace.yaml"), "utf8").includes("packages:")
  ) throw Error("V102_BAD_SCOPE");
  const result: Record<string, string> = {};
  for (const file of Object.keys(rules)) {
    const location = realpathSync(path.join(physical, file));
    if (!location.startsWith(`${physical}/src/`)) throw Error("V102_SOURCE_ESCAPE");
    result[file] = readFileSync(location, "utf8");
  }
  return result;
}
const virtualFile = "src/features/pets/VirtualRead.ts";
const virtualRule = (
  runtime: readonly string[] = [],
  pure: readonly string[] = ["validate"],
): ReadNode => ({
  role: "composed",
  runtime,
  pure,
});
const diagnostics = (code: string, rule: ReadNode = virtualRule()): string[] =>
  inspectReadModules({ [virtualFile]: code }, { [virtualFile]: rule }).errors;
const hasDiagnostic = (list: readonly string[], prefix: string) =>
  list.some((x) => x.startsWith(prefix));

describe("AG3 V102 current Mobile Pets/Vet/Weight production READ static boundary", () => {
  it("current three real source modules form approved runtime read DAG, pure Pet has type-only API reference", () => {
    const graph = inspectReadModules(currentSources(), rules);
    expect(graph.errors).toEqual([]);
    expect(Object.keys(graph.edges).sort()).toEqual(Object.keys(rules).sort());
    expect(Object.values(graph.edges)).toEqual([[], [], []]);
    expect(graph.imports["src/shared/lib/api/petsReadValidation.ts"]).toEqual([
      { from: "./pets", names: [], bound: [], runtime: false, sideEffect: false },
    ]);
    const weight = graph.imports["src/features/pets/petWeightRead.ts"]!;
    const vet = graph.imports["src/features/pets/vetVisitsRead.ts"]!;
    expect(weight.filter((item) => item.runtime).map((item) => item.from)).toEqual(
      rules["src/features/pets/petWeightRead.ts"]!.runtime,
    );
    expect(vet.filter((item) => item.runtime).map((item) => item.from)).toEqual(
      rules["src/features/pets/vetVisitsRead.ts"]!.runtime,
    );
    expect(vet.some((item) => item.from === "@/shared/lib/api/client" && !item.runtime)).toBe(true);
    // Printed only static module paths; no file content or private values.
    console.info(
      "V102_MOBILE_READ_DAG",
      JSON.stringify({
        edges: graph.edges,
        runtime: Object.fromEntries(
          Object.entries(graph.imports).map(([name, items]) => [
            name,
            items.filter((item) => item.runtime).map((item) => item.from),
          ]),
        ),
      }),
    );
  });
  it.each([
    "@gafus/core/services/pets",
    "@gafus/prisma",
    "@prisma/client",
    "next/server",
    "node:fs",
    "fs",
    "node:crypto",
  ])("negative runtime import %s fails despite explicit composition allowlist", (spec) => {
    const result = diagnostics(
      `import {unsafe} from "${spec}"; export function validate(){return 1}`,
      virtualRule([spec]),
    );
    expect(hasDiagnostic(result, "SERVER_RUNTIME:")).toBe(true);
  });
  it("type-only imports from server/Node are exempt, including inline type specifiers", () => {
    const result = diagnostics(
      `import type {PrismaClient} from "@prisma/client";
      import {type ReadStream} from "node:fs";
      export function validate(){return 1}`,
      { role: "pure", runtime: [], pure: ["validate"] },
    );
    expect(result).toEqual([]);
  });
  it("a runtime import of the PET API in a pure validator is rejected; existing type-only import is legal", () => {
    expect(
      hasDiagnostic(
        diagnostics(
          `import {petsApi} from "@/shared/lib/api/pets";
      export function validate(){return 1}`,
          { role: "pure", pure: ["validate"], runtime: [] },
        ),
        "PURE_RUNTIME_IMPORT:",
      ),
    ).toBe(true);
  });
  it("native auth/verified epoch dependencies are legal in composition, but not callable from its pure function", () => {
    const native = "@/shared/lib/offline/newOnlyV2Native";
    const safe = `import {newOnlyV2NativeQueues} from "${native}";
      export function validate(value:unknown){return typeof value==="number"}
      export function composed(){return newOnlyV2NativeQueues.getVerifiedBinding()}`;
    expect(diagnostics(safe, virtualRule([native]))).toEqual([]);
    const bad = safe.replace(
      'return typeof value==="number"',
      "return newOnlyV2NativeQueues.getVerifiedBinding()!==null",
    );
    expect(hasDiagnostic(diagnostics(bad, virtualRule([native])), "PURE_RUNTIME_DEP:")).toBe(true);
  });
  it("pure helper's transitively called top-level helper cannot invoke a provider/adaptor", () => {
    const spec = "@/shared/stores/authStore";
    const source = `import {useAuthStore} from "${spec}";
      function inner(){return useAuthStore.getState().isAuthenticated}
      export function validate(){return inner()}`;
    expect(hasDiagnostic(diagnostics(source, virtualRule([spec])), "PURE_RUNTIME_DEP:")).toBe(true);
  });
  it.each([
    "expo-secure-store",
    "@react-native-async-storage/async-storage",
    "@voximplant/react-native-calls",
    "stream-chat",
    "@aws-sdk/client-s3",
  ])("direct provider/storage import %s is forbidden even in composed read module", (spec) => {
    const result = diagnostics(
      `import {init} from "${spec}";
        export function validate(){return 1}`,
      virtualRule([spec]),
    );
    expect(hasDiagnostic(result, "PROVIDER_RUNTIME:")).toBe(true);
  });
  it("provider initialization at module import time and side-effect import are rejected", () => {
    const spec = "@/shared/stores/authStore";
    const call = diagnostics(
      `import {useAuthStore} from "${spec}";
      const eager=useAuthStore.getState();export function validate(){return 1}`,
      virtualRule([spec]),
    );
    expect(hasDiagnostic(call, "IMPORT_TIME_EFFECT:")).toBe(true);
    const side = diagnostics(
      `import "expo-secure-store";
      export function validate(){return 1}`,
      virtualRule(["expo-secure-store"]),
    );
    expect(hasDiagnostic(side, "SIDE_EFFECT_IMPORT:")).toBe(true);
  });
  it("dynamic import and require cannot bypass approved static imports", () => {
    const dynamic = diagnostics('export function validate(){return import("node:fs")}');
    const requireCall = diagnostics('export function validate(){return require("@gafus/core")}');
    expect(hasDiagnostic(dynamic, "DYNAMIC_OR_REQUIRE:")).toBe(true);
    expect(hasDiagnostic(requireCall, "DYNAMIC_OR_REQUIRE:")).toBe(true);
  });
  it("@gafus/types runtime import permits only existing immutable MIME constant", () => {
    const bad = `import {unsafeValue} from "@gafus/types";
      export function validate(){return 1}`;
    expect(
      hasDiagnostic(diagnostics(bad, virtualRule(["@gafus/types"])), "UNSAFE_TYPES_RUNTIME:"),
    ).toBe(true);
    const good = `import {VET_VISIT_MIME_TYPES} from "@gafus/types";
      export function validate(){return VET_VISIT_MIME_TYPES.length>0}`;
    expect(diagnostics(good, virtualRule(["@gafus/types"]))).toEqual([]);
  });
  it("class static initialization cannot hide import-time provider startup", () => {
    const text = `class Provider {static { fetch("secret") }}
      export function validate(){return 1}`;
    expect(hasDiagnostic(diagnostics(text), "IMPORT_TIME_STATIC_BLOCK:")).toBe(true);
  });
  it("malformed TypeScript fails closed rather than masquerading as empty graph", () => {
    expect(hasDiagnostic(diagnostics("export function validate( {"), "PARSE:")).toBe(true);
  });
  it("runtime re-export of server package blocked but export type from it accepted", () => {
    expect(
      hasDiagnostic(
        diagnostics(`export * from "@gafus/core/services/pets";
      export function validate(){return 1}`),
        "SERVER_RUNTIME:",
      ),
    ).toBe(true);
    expect(
      diagnostics(`export type {PrismaClient} from "@prisma/client";
      export function validate(){return 1}`),
    ).toEqual([]);
  });
  it("two synthetic read modules importing each other produce explicit runtime cycle", () => {
    const a = "src/features/pets/readA.ts",
      b = "src/features/pets/readB.ts";
    const result = inspectReadModules(
      {
        [a]: 'import {b} from "./readB";export const a=1;',
        [b]: 'import {a} from "./readA";export const b=1;',
      },
      {
        [a]: { role: "composed", pure: [], runtime: ["./readB"] },
        [b]: { role: "composed", pure: [], runtime: ["./readA"] },
      },
    );
    expect(hasDiagnostic(result.errors, "RUNTIME_CYCLE:")).toBe(true);
    expect(result.edges[a]).toEqual([b]);
    expect(result.edges[b]).toEqual([a]);
  });
  it("relative runtime import escaping Mobile src is blocked despite allowlisting", () => {
    const spec = "../../../../../../packages/core/src/services/pets";
    const result = diagnostics(
      `import {x} from "${spec}";
      export function validate(){return 1}`,
      virtualRule([spec]),
    );
    expect(hasDiagnostic(result, "SOURCE_ESCAPE:")).toBe(true);
  });
});
