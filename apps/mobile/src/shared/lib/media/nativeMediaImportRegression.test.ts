import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// Expo SDK 55 / React Native 0.83 can load import() media modules as separate
// Metro bundles with an uninitialized HMRClient. This is a native-dev runtime
// regression, not an image encoding failure, so protect the import boundary.
describe("native client media upload module boundaries", () => {
  it.each([
    ["Questions", "../api/questions.ts"],
    ["Chat2", "../../../features/chat2/api.ts"],
  ])("keeps %s upload processors out of Metro async chunks", (_, sourceFile) => {
    const code = readFileSync(new URL(sourceFile, import.meta.url), "utf8");
    expect(code).not.toMatch(/\bimport\s*\(\s*["']@\/shared\/lib\/media\//);
    expect(code).toMatch(/\bprepareUploadWebpVariants\b/);
    expect(code).toMatch(/\bpostClientWebp\b/);
  });
});
