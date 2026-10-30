import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import test from "node:test";

const checker = fileURLToPath(new URL("./check-core-client-boundary.mjs", import.meta.url));

function write(root, name, contents) {
  const file = path.join(root, name);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, contents);
}
function fixture(run) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "gafus-browser-boundary-"));
  try {
    for (const name of ["core-client", "types"]) {
      write(root, `packages/${name}/package.json`, JSON.stringify({
        name: `@gafus/${name}`,
        main: "dist/index.js",
        dependencies: name === "core-client" ? { "@gafus/types": "workspace:*" } : {},
      }));
    }
    write(root, "packages/core-client/src/index.ts", "export { clientValue } from './client';\n");
    write(root, "packages/core-client/src/client.ts", "export const clientValue = 1;\n");
    write(root, "packages/types/src/index.ts", "export const safeValue = 2;\n");
    write(root, "apps/web-vite/package.json", '{"name":"@gafus/web-vite","dependencies":{"@gafus/core-client":"workspace:*"}}');
    write(root, "apps/web-vite/src/index.ts", 'import { clientValue } from "@gafus/core-client"; void clientValue;\n');
    write(root, "apps/mobile/package.json", '{"name":"@gafus/mobile","dependencies":{"@gafus/core-client":"workspace:*"}}');
    write(root, "apps/mobile/src/index.ts", "export const mobile = true;\n");
    return run(root, (name, contents) => write(root, name, contents));
  } finally {
    fs.rmSync(root, { force: true, recursive: true });
  }
}
function check(root) {
  return spawnSync(process.execPath, [checker, "--project-root", root], { encoding: "utf8" });
}

test("safe workspace closure passes", () => fixture((root) => {
  const result = check(root);
  assert.equal(result.status, 0, result.stderr);
}));

test("transitive re-export of Node/server module fails", () => fixture((root, write) => {
  write("packages/types/src/index.ts", 'export * from "./util";\n');
  write("packages/types/src/util.ts", 'export * from "@gafus/prisma";\n');
  write("packages/core-client/src/client.ts", 'export { safeValue as clientValue } from "@gafus/types";\n');
  const result = check(root);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /@gafus\/prisma/);
  assert.match(result.stderr, /packages\/types\/src\/util\.ts/);
}));

test("runtime import from browser app fails even behind relative barrels", () => fixture((root, write) => {
  write("apps/web-vite/src/lib.ts", 'export * from "@gafus/notifications-server";\n');
  write("apps/web-vite/src/index.ts", 'export * from "./lib";\n');
  const result = check(root);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /@gafus\/notifications-server/);
}));

test("erased type-only import does not traverse server code", () => fixture((root, write) => {
  write("apps/web-vite/src/index.ts", 'import type { InternalServerShape } from "@gafus/core";\n');
  const result = check(root);
  assert.equal(result.status, 0, result.stderr);
}));

test("unsafe dependency inside core-client is rejected even when type-only", () => fixture((root, write) => {
  write("packages/core-client/src/client.ts", 'import type { InternalServerShape } from "@gafus/core";\nexport const clientValue = 1;\n');
  const result = check(root);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /unsupported core-client dependency/);
}));

test("a Node builtin reached through a workspace barrel is forbidden", () => fixture((root, write) => {
  write("packages/types/src/index.ts", 'export * from "./node-helper";\n');
  write("packages/types/src/node-helper.ts", 'import { readFileSync } from "node:fs";\nexport const unsafe = readFileSync;\n');
  write("packages/core-client/src/client.ts", 'export { unsafe as clientValue } from "@gafus/types";\n');
  const result = check(root);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /node:fs/);
}));

test("workspace imports from an app need a production dependency", () => fixture((root, write) => {
  write("apps/web-vite/package.json", '{"name":"@gafus/web-vite","devDependencies":{"@gafus/core-client":"workspace:*"}}');
  const result = check(root);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /runtime dependency @gafus\/core-client must be in dependencies/);
}));


test("root logger barrel leak fails while dedicated training subpath stays safe", () => fixture((root, write) => {
  write("packages/core-client/src/client.ts", 'export { TrainingStatus as clientValue } from "@gafus/types/training-client";\n');
  write("packages/types/package.json", JSON.stringify({
    name: "@gafus/types", main: "dist/index.js", exports: {
      ".": { default: "./dist/index.js" },
      "./training-client": { default: "./dist/training-client.js" },
      "./logger": { default: "./dist/logger.js" },
    },
  }));
  write("packages/types/src/training-client.ts", 'export const TrainingStatus = "OK";\n');
  write("packages/types/src/index.ts", 'export * from "./utils/logger";\n');
  write("packages/types/src/utils/logger.ts", 'export { makeLogger } from "@gafus/logger";\n');
  assert.equal(check(root).status, 0);
  write("packages/core-client/src/client.ts", 'export { makeLogger as clientValue } from "@gafus/types";\n');
  const result = check(root);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /@gafus\/logger/);
}));
