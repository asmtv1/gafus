/** INFRA032 pure synthetic target tests; no files, .env, ports or services. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { assertIsolatedLocalTargets } from "./local-development-preflight.mjs";

const fixture = () => ({
  NODE_ENV: "development",
  API_HOST: "127.0.0.1",
  API_PORT: "4301",
  DATABASE_URL:
    "postgresql://gafus_refactor_local_test:fake-only@127.0.0.1:5544/gafus_refactor_local_dev",
  REDIS_URL: "redis://127.0.0.1:6384/3",
  CDN_HEALTH_MONITOR_ENABLED: "false",
  GALLERY_ENABLED: "false",
  FEED_ENABLED: "false",
});
function rejected(override, expected) {
  assert.throws(
    () => assertIsolatedLocalTargets({ ...fixture(), ...override }),
    new RegExp(`^Error: LOCAL_PREFLIGHT_${expected}$`),
  );
}

test("explicit isolated loopback-only scratch resources: no secrets returned", () => {
  assert.deepEqual(assertIsolatedLocalTargets(fixture()), {
    resources: 3,
    loopbackOnly: true,
    scratchNamespaced: true,
  });
});
test("fail-closed missing DB/Redis/API and implicit runtime defaults", () => {
  for (const [key, expected] of [
    ["API_PORT", "API_PORT"],
    ["DATABASE_URL", "POSTGRES_TARGET"],
    ["REDIS_URL", "REDIS_TARGET"],
    ["API_HOST", "RUNTIME_MODE"],
  ])
    rejected({ [key]: undefined }, expected);
  rejected({ NODE_ENV: "production" }, "RUNTIME_MODE");
  rejected({ API_HOST: "0.0.0.0" }, "RUNTIME_MODE");
});
test("forbid nonloopback hosts and unsafe URL forms without logging input", () => {
  for (const replacement of ["prod.example", "localhost", "192.168.1.7", "host.docker.internal"]) {
    rejected(
      { DATABASE_URL: fixture().DATABASE_URL.replace("127.0.0.1", replacement) },
      "POSTGRES_TARGET",
    );
    rejected({ REDIS_URL: fixture().REDIS_URL.replace("127.0.0.1", replacement) }, "REDIS_TARGET");
  }
  rejected({ DATABASE_URL: fixture().DATABASE_URL + "?schema=public" }, "POSTGRES_TARGET");
  rejected({ DATABASE_URL: fixture().DATABASE_URL + "#fragment" }, "POSTGRES_TARGET");
  rejected(
    { DATABASE_URL: fixture().DATABASE_URL.replace("postgresql:", "mysql:") },
    "POSTGRES_TARGET",
  );
});
test("forbid shared ports, default service ports, conflicting reservations", () => {
  rejected({ API_PORT: "3001" }, "API_PORT");
  rejected({ API_PORT: "4174" }, "API_PORT");
  rejected({ API_PORT: "5173" }, "API_PORT");
  rejected({ DATABASE_URL: fixture().DATABASE_URL.replace(":5544/", ":5432/") }, "POSTGRES_PORT");
  rejected({ REDIS_URL: fixture().REDIS_URL.replace(":6384/", ":6379/") }, "REDIS_PORT");
  rejected({ API_PORT: "5544" }, "PORT_COLLISION");
  rejected({ API_PORT: "6384" }, "PORT_COLLISION");
});
test("forbid ordinary production/staging/shared DB names or roles and Redis default DB", () => {
  rejected(
    { DATABASE_URL: fixture().DATABASE_URL.replace("gafus_refactor_local_dev", "gafus") },
    "POSTGRES_IDENTITY",
  );
  rejected(
    {
      DATABASE_URL: fixture().DATABASE_URL.replace(
        "gafus_refactor_local_dev",
        "gafus_refactor_local_prod",
      ),
    },
    "POSTGRES_IDENTITY",
  );
  rejected(
    { DATABASE_URL: fixture().DATABASE_URL.replace("gafus_refactor_local_test", "postgres") },
    "POSTGRES_IDENTITY",
  );
  rejected({ REDIS_URL: fixture().REDIS_URL.replace("/3", "/0") }, "REDIS_NAMESPACE");
  rejected({ REDIS_URL: fixture().REDIS_URL.replace("/3", "/16") }, "REDIS_NAMESPACE");
});
test("deny active media polling, queue-linked external credentials, payments, notifications", () => {
  for (const flag of ["CDN_HEALTH_MONITOR_ENABLED", "GALLERY_ENABLED", "FEED_ENABLED"])
    rejected({ [flag]: "true" }, "MEDIA_NOT_DISABLED");
  for (const key of [
    "YOOKASSA_SECRET_KEY",
    "RESEND_API_KEY",
    "RUSTORE_API_KEY",
    "GALLERY_CDN_SECRET",
    "AWS_ACCESS_KEY_ID",
    "BOT_TOKEN",
    "SMTP_PASSWORD",
  ])
    rejected({ [key]: "fake" }, "EXTERNAL_CREDENTIALS_PRESENT");
});
test("CLI is dry-run only and never boots; synthetic env, no inherited process env", () => {
  const cmd = new URL("./local-development-preflight.mjs", import.meta.url);
  const args = [cmd.pathname, "--dry-run"];
  const ok = spawnSync(process.execPath, args, {
    cwd: process.cwd(),
    env: fixture(),
    encoding: "utf8",
    timeout: 7000,
  });
  assert.equal(ok.status, 0, ok.stderr);
  assert.match(ok.stdout, /NO_CONNECTION_ATTEMPTED/);
  assert.doesNotMatch(ok.stdout, /fake-only|5544|6384/);
  const deny = spawnSync(process.execPath, [cmd.pathname, "--boot"], {
    cwd: process.cwd(),
    env: fixture(),
    encoding: "utf8",
    timeout: 7000,
  });
  assert.notEqual(deny.status, 0);
  assert.match(deny.stderr, /LOCAL_PREFLIGHT_DRY_RUN_ONLY/);
});
