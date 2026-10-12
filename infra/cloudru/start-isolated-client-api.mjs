import { readFile, writeFile } from "node:fs/promises";
import { randomBytes } from "node:crypto";
import { homedir } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";
import { parse } from "dotenv";
const e = {
  ...parse(await readFile(join(homedir(), ".codex/cloudru/storage-credentials.env"), "utf8")),
  ...process.env,
};
if (
  e.GAFUS_CLIENT_STAGE_CONFIRM !== "localhost-only-real-jwt" ||
  e.CLOUDRU_S3_ENDPOINT !== "https://s3.cloud.ru" ||
  !e.CLOUDRU_S3_ACCESS_KEY_ID ||
  !e.CLOUDRU_S3_SECRET_ACCESS_KEY
)
  throw Error("CLIENT_STAGE_LAUNCH_DENIED");
const dir = join(homedir(), ".codex/cloudru/gafus-media-core-staging");
const vals = Object.fromEntries(
  (await readFile(join(dir, "core.env"), "utf8"))
    .trim()
    .split("\n")
    .map((x) => {
      const i = x.indexOf("=");
      return [x.slice(0, i), x.slice(i + 1)];
    }),
);
let jwt;
try {
  jwt = (await readFile(join(dir, "client-jwt-secret"), "utf8")).trim();
} catch {
  jwt = randomBytes(48).toString("base64url");
  await writeFile(join(dir, "client-jwt-secret"), jwt + "\n", { mode: 0o600, flag: "wx" });
}
if (jwt.length < 32 || vals.PG_APP_PASSWORD?.length < 16 || vals.REDIS_PASSWORD?.length < 16)
  throw Error("STAGE_LOCAL_SECRET_INVALID");
const cfg = {
  PATH: e.PATH,
  HOME: homedir(),
  USER: e.USER ?? "asmtv1",
  NODE_ENV: "test",
  GAFUS_CLIENT_STAGE_ONLY: "localhost-media-jwt",
  DATABASE_URL:
    "postgresql://gafus_media_stage:" +
    vals.PG_APP_PASSWORD +
    "@127.0.0.1:55448/gafus_media_stage?schema=public",
  REDIS_URL: "redis://:" + vals.REDIS_PASSWORD + "@127.0.0.1:56389",
  JWT_SECRET: jwt,
  API_PORT: "31341",
  GALLERY_ENABLED: "false",
  FEED_ENABLED: "true",
  FEED_PROCESSOR_READY: "true",
  FEED_MEDIA_FALLBACK_ENABLED: "true",
  FEED_CDN_EDGE_TOKEN_VERIFIED: "true",
  FEED_S3_ENDPOINT: e.CLOUDRU_S3_ENDPOINT,
  FEED_S3_ACCESS_KEY_ID: e.CLOUDRU_S3_ACCESS_KEY_ID,
  FEED_S3_SECRET_ACCESS_KEY: e.CLOUDRU_S3_SECRET_ACCESS_KEY,
  FEED_BUCKET: "gafus-feed-private",
  FEED_CDN_BASE_URL: "https://feed.gafus.ru",
  FEED_CDN_SECRET: JSON.parse(await readFile("infra/feed/.secrets/runtime.json", "utf8"))
    .cdn_secret,
  FEED_INTERNAL_HMAC_SECRET: vals.FEED_INTERNAL_HMAC_SECRET,
};
const child = spawn(
  "pnpm",
  ["--filter", "@gafus/api", "exec", "tsx", "staging-client-api.ts"],
  { stdio: "inherit", cwd: process.cwd(), env: cfg },
);
process.on("SIGTERM", () => child.kill("SIGTERM"));
process.on("SIGINT", () => child.kill("SIGINT"));
child.on("exit", (code, signal) => {
  process.exitCode = code ?? (signal ? 1 : 0);
});
