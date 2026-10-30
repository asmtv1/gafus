/** Usage (local Refactor only):
 * pnpm --filter @gafus/api exec tsx src/modules/chat2/import-cli.ts --file /Users/asmtv1/Desktop/gafus-refactor/.local-pg-scratch/export.json
 * Append --apply with CHAT2_IMPORT_ISOLATED=enabled ONLY for verified scratch PostgreSQL on 55432.
 */
import { lstatSync, readFileSync, realpathSync } from "node:fs";
import { resolve } from "node:path";
import { prisma } from "@gafus/prisma";
import { validateArchive, importArchiveIntoIsolatedDatabase } from "./archive.js";

async function main() {
  const args = process.argv.slice(2);
  const fileIndex = args.indexOf("--file");
  if (
    fileIndex < 0 ||
    !args[fileIndex + 1] ||
    args.some((x, i) => x.startsWith("-") && x !== "--file" && x !== "--apply") ||
    args.length !== (args.includes("--apply") ? 3 : 2)
  )
    throw new Error("USAGE: --file <inside-isolated-scratch.json> [--apply]");
  const root = "/Users/asmtv1/Desktop/gafus-refactor";
  const path = resolve(args[fileIndex + 1]);
  if (!path.startsWith(`${root}/.local-pg-scratch/`))
    throw new Error("OUTSIDE_ALLOWED_CHAT2_IMPORT_SCRATCH");
  if (lstatSync(path).isSymbolicLink()) throw new Error("SYMLINK_SOURCE_FORBIDDEN");
  if (!realpathSync(path).startsWith(`${root}/.local-pg-scratch/`))
    throw new Error("SOURCE_PATH_ESCAPE");
  const st = lstatSync(path);
  if (!st.isFile() || st.size <= 0 || st.size > 25 * 1024 * 1024)
    throw new Error("SOURCE_INVALID_OR_TOO_LARGE");
  const body = JSON.parse(readFileSync(path, "utf8")) as unknown;
  const result = validateArchive(body);
  // No user/message content printed, no implicit writes.
  if (!args.includes("--apply")) {
    console.log("CHAT2_ARCHIVE_DRY_RUN", JSON.stringify(result.summary));
    return;
  }
  const applied = await importArchiveIntoIsolatedDatabase(body);
  console.log("CHAT2_ARCHIVE_ISOLATED_APPLY", JSON.stringify(applied));
}
main()
  .catch((error) => {
    console.error("CHAT2_IMPORT_FAILED", error instanceof Error ? error.message : "Unknown error");
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
