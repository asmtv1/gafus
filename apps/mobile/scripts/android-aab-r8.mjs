export function readAabR8Mapping(entries, readEntry) {
  const entry = entries.find((name) =>
    /^(?:base\/)?BUNDLE-METADATA\/com\.android\.tools\.build\.obfuscation\/proguard\.map$/.test(name));
  return entry ? readEntry(entry).toString("utf8") : "";
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
