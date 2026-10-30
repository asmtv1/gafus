import { existsSync, readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";

// Test the public package declaration surface as a NodeNext consumer, not the
// source barrel. The fixture is virtual: no temporary source or dist mutation.
const projectRoot = resolve(import.meta.dirname, "../../..");
const dist = resolve(projectRoot, "packages/types/dist");

function checkNodeNextPublicImports() {
  const fixture = resolve(projectRoot, "packages/feed-server/src/__types_public_nodenext_probe__.mts");
  const content = `
    import { FEED_LIMITS, normalizeUsernameAvailabilityInput,
      isValidOwnedPetWeightId, parseOwnedPetWeightHistoryData } from "@gafus/types";
    import type { UsernameAvailabilityData } from "@gafus/types";
    const duration: number = FEED_LIMITS.videoSeconds;
    const valid: boolean = isValidOwnedPetWeightId("pet_A");
    const normalized = normalizeUsernameAvailabilityInput("test");
    const weight = parseOwnedPetWeightHistoryData({ entries: [] }, "pet_A");
    const data: UsernameAvailabilityData | null = null;
    void [duration, valid, normalized, weight, data];
  `;
  const options: ts.CompilerOptions = {
    module: ts.ModuleKind.NodeNext,
    moduleResolution: ts.ModuleResolutionKind.NodeNext,
    target: ts.ScriptTarget.ES2022,
    strict: true,
    noEmit: true,
    skipLibCheck: true,
    esModuleInterop: true,
  };
  const host = ts.createCompilerHost(options);
  const baseGetSource = host.getSourceFile.bind(host);
  const baseFileExists = host.fileExists.bind(host);
  const baseReadFile = host.readFile.bind(host);
  host.fileExists = (name) => name === fixture || baseFileExists(name);
  host.readFile = (name) => name === fixture ? content : baseReadFile(name);
  host.getSourceFile = (name, languageVersion, onError, shouldCreateNewSourceFile) =>
    name === fixture ? ts.createSourceFile(name, content, languageVersion, true) :
    baseGetSource(name, languageVersion, onError, shouldCreateNewSourceFile);
  return ts.getPreEmitDiagnostics(ts.createProgram([fixture], options, host)).map((diagnostic) =>
    ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n"));
}

describe("published Types declaration contract", () => {
  it("resolves FEED_LIMITS, username and pet weight from the public root in NodeNext", () => {
    expect(checkNodeNextPublicImports()).toEqual([]);
    expect(readFileSync(resolve(dist, "index.d.ts"), "utf8")).toMatch(/from ["']\.\/feed\.js["']/);
  });

  it("does not publish any compiled test artifacts", () => {
    const files = readdirSync(dist, { recursive: true }).map(String);
    expect(files.filter((file) => /(?:\.test|\.spec)\.(?:[cm]?js|[cm]?ts|d\.[cm]?ts)$/.test(file))).toEqual([]);
    expect(existsSync(resolve(dist, "index.d.ts"))).toBe(true);
  });
});
