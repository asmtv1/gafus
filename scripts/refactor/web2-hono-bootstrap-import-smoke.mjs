/** WEB-2 read-only registered Hono module-bootstrap contract.
 * Does not create SQL test actors or MinIO objects, intentionally issue
 * Redis commands/API requests, send push, or propagate provider credentials.
 * Importing Hono can initialize a local Redis client; every isolated child
 * exits immediately after the import checks to avoid waiting on its handles.
 */
import { spawnSync } from "node:child_process";
import { realpathSync } from "node:fs";
const root = "/Users/asmtv1/Desktop/gafus-refactor";
const cwd = realpathSync(process.cwd());
if (cwd !== root || realpathSync(root) !== root) throw Error("WEB2_IMPORT_ROOT_DENIED");
const git = (...args) => {
  const r = spawnSync("git", ["-C", root, ...args], { cwd: root, encoding: "utf8" });
  if (r.status !== 0) throw Error("WEB2_IMPORT_GIT_PREFLIGHT_FAILED");
  return r.stdout.trim();
};
if (git("rev-parse", "--show-toplevel") !== root ||
    git("branch", "--show-current") !== "vite") throw Error("WEB2_IMPORT_BRANCH_DENIED");
const env = {
  PATH: process.env.PATH,
  HOME: root + "/.local-pg-scratch",
  NODE_ENV: "test",
  GAFUS_LOCAL_ISOLATED_API: "1",
  COREPACK_ENABLE_NETWORK: "0",
  CI: "1",
};
const checks = [
  {
    title: "WEB2_WEBPUSH_CORE_NODE_EXPORTS",
    command: process.execPath,
    args: ["--input-type=module", "-e", `
      import { PushNotificationService, partitionPushSubscriptions,
        sendExpoPushNotifications, sendRustorePushNotifications } from "@gafus/webpush";
      import { sendBroadcastPush } from "@gafus/core/services/adminBroadcast";
      for (const fn of [PushNotificationService, partitionPushSubscriptions,
        sendExpoPushNotifications, sendRustorePushNotifications, sendBroadcastPush]) {
        if (typeof fn !== "function") throw Error("WEB2_MISSING_NAMED_EXPORT");
      }
      console.log("WEB2_WEBPUSH_CORE_NODE_EXPORTS_PASS");
    `],
  },
  {
    title: "WEB2_REGISTERED_HONO_TSX_IMPORT",
    command: "pnpm",
    args: ["--dir", "apps/api", "exec", "tsx", "-e", `
      import("./src/app.ts").then(m => {
        if (!m.app || typeof m.app.request !== "function")
          throw Error("WEB2_INVALID_REGISTERED_HONO_APP");
        console.log("WEB2_REGISTERED_HONO_TSX_IMPORT_PASS");
        process.exit(0);
      }).catch(() => process.exit(1));
    `],
  },
];
for (const check of checks) {
  const result = spawnSync(check.command, check.args, {
    cwd: root, env, encoding: "utf8", timeout: 20000, maxBuffer: 1024 * 1024,
  });
  if (result.error || result.signal || result.status !== 0 ||
      !result.stdout.includes(check.title + "_PASS")) {
    // A failure must not dump possible inherited secrets or provider output.
    console.error(check.title + "_FAIL", result.error?.name ?? result.signal ?? result.status);
    process.exit(1);
  }
  console.log(check.title + "_PASS");
}
console.log("WEB2_HONO_BOOTSTRAP_READONLY_SMOKE_PASS");
