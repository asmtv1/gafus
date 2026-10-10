import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const appsRoot = fileURLToPath(new URL("../../../../../", import.meta.url));
const sourceRoots = ["mobile/src", "mobile/app", "web/src"];
const loaderFiles = [
  "mobile/src/shared/components/ui/LoadingMascot.tsx",
  "web/src/shared/components/ui/LoadingMascot.tsx",
];

function* sourceFiles(directory: string): Generator<string> {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (entry.name.startsWith(".") || entry.name === "node_modules") continue;
    const location = join(directory, entry.name);
    if (entry.isDirectory()) yield* sourceFiles(location);
    else if (entry.isFile() && /\.tsx$/.test(entry.name) && !/\.(test|spec)\.tsx$/.test(entry.name)) {
      yield location;
    }
  }
}

describe("GAFUS loading mascot size contract", () => {
  it("keeps the single 168 px mascot in mobile and web", () => {
    for (const file of loaderFiles) {
      const source = readFileSync(join(appsRoot, file), "utf8");
      expect(source, file).toMatch(/export const STANDARD_LOADING_MASCOT_PX = 168;/);
      expect(source, file).not.toMatch(/\bpixelSize\b/);
    }
  });

  it("does not allow small/custom mascot sizing anywhere in mobile or web JSX", () => {
    const deprecatedSizeProp =
      /<(?:LoadingState|LoadingMascot|Loading|MascotSpinner)\b[^>]*\b(?:size|pixelSize)\s*=/g;
    const invalidLocations: string[] = [];
    for (const root of sourceRoots) {
      for (const file of sourceFiles(join(appsRoot, root))) {
        const text = readFileSync(file, "utf8");
        const matches = [...text.matchAll(deprecatedSizeProp)];
        for (const match of matches) {
          const line = text.slice(0, match.index).split("\n").length;
          invalidLocations.push(`${file}:${line}`);
        }
      }
    }
    expect(invalidLocations).toEqual([]);
  });
});
