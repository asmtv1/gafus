/** Restrict local isolated media processing to the *current* workspace clone. */
import { existsSync, realpathSync } from "node:fs";
import { dirname, join } from "node:path";

export function localFeedWorkspaceRoot(start = process.cwd()): string {
  let directory = realpathSync(start);
  while (true) {
    if (existsSync(join(directory, "pnpm-workspace.yaml")) &&
        existsSync(join(directory, "apps/feed-cloud/package.json")) &&
        existsSync(join(directory, "apps/feed-cloud/src/worker.ts"))) return directory;
    const parent = dirname(directory);
    if (parent === directory) throw new Error("GAFUS_LOCAL_WORKSPACE_ROOT_NOT_FOUND");
    directory = parent;
  }
}
