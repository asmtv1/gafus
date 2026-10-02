import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
const root = dirname(dirname(fileURLToPath(import.meta.url)));
process.chdir(root);
process.loadEnvFile(join(root, ".env"));
process.loadEnvFile(join(root, ".env.stream-chat-test"));
if (!process.env.STREAM_API_KEY || !process.env.STREAM_API_SECRET)
  throw new Error("Development Stream credentials are required in .env.stream-chat-test");
// Keep local tests isolated from production databases and background queues.
Object.assign(process.env, {
  NODE_ENV: "development",
  DATABASE_URL: "postgresql://asmtv1@127.0.0.1:5432/dog_trainer",
  REDIS_URL: "redis://127.0.0.1:6379/15",
  API_PORT: "3005",
  CYNOLOGIST_CHAT_ENABLED: "true",
  COMMUNITY_CHAT_ENABLED: "true",
  CYNOLOGIST_CHAT_TRAINER_USER_ID: "cmhq7qk2s0000nn01jr2ptnil",
});
const require = createRequire(join(root, "apps/api/package.json"));
const child = spawn(
  process.execPath,
  [require.resolve("tsx/cli"), "watch", "apps/api/src/index.ts"],
  { cwd: root, env: process.env, stdio: "inherit" },
);
for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => child.kill(signal));
child.on("exit", (code) => process.exit(code ?? 0));
console.log("Local chat API: http://192.168.31.25:3005 (development Stream, local database)");
