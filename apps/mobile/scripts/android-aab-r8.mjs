import { execFileSync } from "node:child_process";

// Read the ZIP entry incrementally. R8 method/field mappings can exceed
// hundreds of MB; only class mappings are relevant to DEX presence checks.
export function readAabR8Mapping(entries, archivePath) {
  const entry = entries.find((name) =>
    /^(?:base\/)?BUNDLE-METADATA\/com\.android\.tools\.build\.obfuscation\/proguard\.map$/.test(name));
  if (!entry) return "";
  const filter = [
    "import re, sys, zipfile",
    "pattern = re.compile(rb'^\\S+ -> \\S+:$')",
    "with zipfile.ZipFile(sys.argv[1]) as archive:",
    "    with archive.open(sys.argv[2]) as mapping:",
    "        for line in mapping:",
    "            if pattern.fullmatch(line.rstrip(b'\\r\\n')):",
    "                sys.stdout.buffer.write(line.rstrip(b'\\r\\n') + b'\\n')",
  ].join("\n");
  try {
    return execFileSync("python3", ["-c", filter, archivePath, entry], {
      encoding: "utf8", maxBuffer: 64 * 1024 * 1024, timeout: 120_000,
    });
  } catch (error) {
    throw new Error("ANDROID_AAB_R8_MAPPING_READ_FAILED: " + (error.code ?? error.status ?? "unknown"));
  }
}

export function dexHasMappedClass(dex, mapping, originalClass) {
  // R8 lists class mappings without indentation. Ignore methods, fields and metadata.
  for (const [, original, renamed] of mapping.matchAll(/^(\S+) -> (\S+):\r?$/gm)) {
    if (!originalClass.test(original)) continue;
    const descriptor = `L${renamed.replaceAll(".", "/")};`;
    if (dex.some((file) => file.includes(descriptor))) return true;
  }
  return false;
}
