import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

export const compiledRevisionPath = fileURLToPath(
  new URL("../src/shared/lib/otaRevision.generated.ts", import.meta.url),
);
const baseline = /^(\/\*\*[^]*?\*\/\s*)?export const OTA_COMPILED_REVISION = 0;\s*$/;

/** Embed a revision in JS without depending on EAS SDK55 environment substitution. */
export async function withCompiledOtaRevision(revision, publish, path = compiledRevisionPath) {
  if (!Number.isSafeInteger(Number(revision)) || !/^[1-9]\d*$/.test(String(revision))) {
    throw new Error("OTA_REVISION_INVALID");
  }
  const original = readFileSync(path, "utf8");
  if (!baseline.test(original)) {
    throw new Error("OTA_REVISION_SOURCE_NOT_BASELINE_ZERO: restore version 0 before publishing");
  }
  writeFileSync(path, original.replace("OTA_COMPILED_REVISION = 0;", `OTA_COMPILED_REVISION = ${revision};`));
  try {
    return await publish();
  } finally {
    writeFileSync(path, original);
  }
}
