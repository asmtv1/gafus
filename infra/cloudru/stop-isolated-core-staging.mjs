/** Stops ONLY the localhost isolated GAFUS staging PostgreSQL/Redis; data remains. */
import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
if (process.env.GAFUS_ISOLATED_STOP_CONFIRM !== "localhost-stage-only")
  throw Error("NOT_AUTHORIZED");
const dir = join(homedir(), ".codex/cloudru/gafus-media-core-staging");
const fields = Object.fromEntries(
  (await readFile(join(dir, "core.env"), "utf8"))
    .trim()
    .split("\n")
    .map((x) => {
      const i = x.indexOf("=");
      return [x.slice(0, i), x.slice(i + 1)];
    }),
);
const data = join(dir, "pg14");
const pg = spawnSync("pg_isready", ["-h", "127.0.0.1", "-p", "55448"], {
  encoding: "utf8",
  timeout: 5000,
});
if (pg.status === 0) {
  const r = spawnSync("pg_ctl", ["-D", data, "-m", "fast", "stop", "-w"], {
    encoding: "utf8",
    timeout: 18000,
  });
  if (r.status !== 0) throw Error("STAGING_PG_STOP_FAILED");
}
const redis = spawnSync(
  "redis-cli",
  ["-h", "127.0.0.1", "-p", "56389", "--no-auth-warning", "ping"],
  {
    encoding: "utf8",
    env: { ...process.env, REDISCLI_AUTH: fields.REDIS_PASSWORD },
    timeout: 5000,
  },
);
if (redis.stdout?.trim() === "PONG") {
  const r = spawnSync(
    "redis-cli",
    ["-h", "127.0.0.1", "-p", "56389", "--no-auth-warning", "shutdown", "nosave"],
    {
      encoding: "utf8",
      env: { ...process.env, REDISCLI_AUTH: fields.REDIS_PASSWORD },
      timeout: 10000,
    },
  );
  if (r.status !== 0) throw Error("STAGING_REDIS_STOP_FAILED");
}
console.log(
  JSON.stringify({
    onlyLocalStaging: true,
    pgPort: 55448,
    redisPort: 56389,
    stageProcessesStopped: true,
    stageDatabaseFilesPreserved: true,
  }),
);
