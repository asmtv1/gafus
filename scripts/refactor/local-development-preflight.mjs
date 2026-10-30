/**
 * INFRA032: OFFLINE fail-closed validation of proposed scratch-only API targets.
 * No dotenv, DB, Redis, network, ports, imports of app/queues, or server startup.
 * A passing preflight is NOT permission to boot the current API entrypoint.
 */
import { realpathSync } from "node:fs";

const ROOT = "/Users/asmtv1/Desktop/gafus-refactor";
const reserved = new Set([3001, 3002, 3003, 3006, 4174, 4175, 4178, 4179, 5173, 5432, 6379]);
const networkCredentialPatterns = [
  /^(?:YOOKASSA_|RESEND_|SMTP_|MAIL_|SENDGRID_|APNS_|FCM_|FIREBASE_|RUSTORE_)/,
  /^(?:AWS_|S3_|CLOUDRU_|CLOUD_RU_|YANDEX_|VK_|TELEGRAM_|BOT_TOKEN)/,
  /^(?:PAYMENT_|WEBHOOK_|BEGET_|GALLERY_CDN_SECRET|FEED_CDN_SECRET)/,
];

function fail(code) {
  // Never include user-provided URLs, tokens, passwords or environment values.
  throw new Error(`LOCAL_PREFLIGHT_${code}`);
}
function port(raw, label) {
  if (typeof raw !== "string" || !/^[1-9][0-9]{3,4}$/.test(raw)) fail(label);
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value < 1024 || value > 65535 || reserved.has(value))
    fail(label);
  return value;
}
function url(raw, protocol, label) {
  if (typeof raw !== "string" || raw.length === 0) fail(label);
  let parsed;
  try {
    parsed = new URL(raw);
  } catch {
    fail(label);
  }
  if (
    parsed.protocol !== protocol ||
    parsed.hostname !== "127.0.0.1" ||
    parsed.hash ||
    parsed.search ||
    !parsed.port ||
    parsed.pathname.includes("%")
  )
    fail(label);
  return parsed;
}

/** Accept only a caller-provided env object; no implicit inherited configuration. */
export function assertIsolatedLocalTargets(env) {
  if (!env || typeof env !== "object" || Array.isArray(env)) fail("INPUT");
  if (env.NODE_ENV !== "development" || env.API_HOST !== "127.0.0.1") fail("RUNTIME_MODE");
  const apiPort = port(env.API_PORT, "API_PORT");
  const db = url(env.DATABASE_URL, "postgresql:", "POSTGRES_TARGET");
  const postgresPort = port(db.port, "POSTGRES_PORT");
  if (
    !/^gafus_refactor_local_[a-z0-9_]+$/.test(db.pathname.slice(1)) ||
    db.pathname.slice(1).includes("prod") ||
    db.pathname.slice(1).includes("main") ||
    !/^gafus_refactor_local_[a-z0-9_]*$/.test(decodeURIComponent(db.username)) ||
    !db.password
  )
    fail("POSTGRES_IDENTITY");
  const redis = url(env.REDIS_URL, "redis:", "REDIS_TARGET");
  const redisPort = port(redis.port, "REDIS_PORT");
  if (!/^\/(?:[1-9]|1[0-5])$/.test(redis.pathname)) fail("REDIS_NAMESPACE");
  if (new Set([apiPort, postgresPort, redisPort]).size !== 3) fail("PORT_COLLISION");
  if (
    env.CDN_HEALTH_MONITOR_ENABLED === "true" ||
    env.GALLERY_ENABLED === "true" ||
    env.FEED_ENABLED === "true"
  )
    fail("MEDIA_NOT_DISABLED");
  const activeCredentialKeys = Object.keys(env).filter(
    (key) =>
      networkCredentialPatterns.some((pattern) => pattern.test(key)) &&
      typeof env[key] === "string" &&
      env[key].length > 0,
  );
  if (activeCredentialKeys.length) fail("EXTERNAL_CREDENTIALS_PRESENT");
  // Intentionally return only non-sensitive fact flags, never URLs or credentials.
  return Object.freeze({ resources: 3, loopbackOnly: true, scratchNamespaced: true });
}

if (process.argv[1] && realpathSync(process.argv[1]) === realpathSync(new URL(import.meta.url))) {
  if (process.argv.length !== 3 || process.argv[2] !== "--dry-run") fail("DRY_RUN_ONLY");
  if (realpathSync(process.cwd()) !== ROOT) fail("PROJECT_ROOT");
  assertIsolatedLocalTargets(process.env);
  process.stdout.write(
    "LOCAL_RESOURCE_PREFLIGHT_PASS; API_BOOT_BLOCKED_PENDING_SYSTEM_GATES; NO_CONNECTION_ATTEMPTED\n",
  );
}
