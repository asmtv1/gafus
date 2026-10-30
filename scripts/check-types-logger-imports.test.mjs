import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

const checker = fileURLToPath(new URL("./check-types-logger-imports.mjs", import.meta.url));
function fixture(files) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "gafus-types-logger-"));
  try {
    for (const [name, source] of Object.entries(files)) {
      const target = path.join(root, name);
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.writeFileSync(target, source);
    }
    return spawnSync(process.execPath, [checker, "--project-root", root], { encoding: "utf8" });
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
}

test("admin runtime logger import is rejected", () => {
  const r = fixture({ "apps/admin-panel/src/bad.ts": 'import { createLogger as log } from "@gafus/types";\nlog("admin");' });
  assert.equal(r.status, 1, r.stderr); assert.match(r.stderr, /createLogger/);
});
test("telegram exported logger runtime is rejected", () => {
  const r = fixture({ "apps/telegram-bot/src/bad.ts": 'export { silentLogger } from "@gafus/types";' });
  assert.equal(r.status, 1, r.stderr); assert.match(r.stderr, /silentLogger/);
});
test("error dashboard shouldLog runtime and dynamic access are rejected", () => {
  const r = fixture({ "apps/error-dashboard/src/bad.ts": 'import { shouldLog } from "@gafus/types";\nconst x = import("@gafus/types");' });
  assert.equal(r.status, 1, r.stderr); assert.match(r.stderr, /shouldLog/); assert.match(r.stderr, /dynamic root/);
});
test("namespace, wildcard and require bypasses are rejected", () => {
  const r = fixture({ "scripts/bad.mjs": 'import * as types from "@gafus/types";\nexport * from "@gafus/types";\nconst types2 = require("@gafus/types");' });
  assert.equal(r.status, 1, r.stderr); assert.match(r.stderr, /namespace/); assert.match(r.stderr, /wildcard/); assert.match(r.stderr, /dynamic root/);
});
test("TypeScript import-equals runtime root alias is rejected", () => {
  const r = fixture({ "packages/worker/src/bad.ts": 'import types = require("@gafus/types");\ntypes.createLogger("queue");' });
  assert.equal(r.status, 1, r.stderr); assert.match(r.stderr, /import-equals/);
});
test("explicit server entrypoint and erased root type imports pass", () => {
  const r = fixture({ "apps/admin-panel/src/safe.ts": 'import type { Logger } from "@gafus/types";\nimport { type LogMeta, TrainingStatus } from "@gafus/types";\nimport { createLogger, silentLogger, shouldLog } from "@gafus/types/logger";\nexport type { Logger as LogType } from "@gafus/types";\nvoid createLogger; void silentLogger; void shouldLog; void TrainingStatus;' });
  assert.equal(r.status, 0, r.stderr);
});
