import { readdir, readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { extname, join } from "node:path";

const distDir = new URL("../dist/", import.meta.url);
const distPath = fileURLToPath(distDir);

function addJsExtension(specifier) {
  if (!(specifier.startsWith("./") || specifier.startsWith("../"))) {
    return specifier;
  }
  if (extname(specifier) || specifier.endsWith("/")) {
    return specifier;
  }
  return `${specifier}.js`;
}

function rewriteImports(source) {
  return source.replace(
    /(from\s+["'])(\.\.?\/[^"']+)(["'])/g,
    (_match, prefix, specifier, suffix) => `${prefix}${addJsExtension(specifier)}${suffix}`,
  );
}

const files = await readdir(distPath);

await Promise.all(
  files
    .filter((name) => name.endsWith(".js"))
    .map(async (name) => {
      const filePath = join(distPath, name);
      const content = await readFile(filePath, "utf8");
      const updated = rewriteImports(content);
      if (updated !== content) {
        await writeFile(filePath, updated, "utf8");
      }
    }),
);
