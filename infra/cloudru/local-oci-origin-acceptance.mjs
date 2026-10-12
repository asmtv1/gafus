import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { parse } from "dotenv";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
  HeadObjectCommand,
} from "@aws-sdk/client-s3";
if (
  process.env.GAFUS_LOCAL_OCI_TEST !== "only-localhost-uuid-delete" ||
  process.env.CLOUDRU_S3_ENDPOINT !== "https://s3.cloud.ru"
)
  throw Error("LOCAL_TEST_NOT_AUTHORIZED");
const q = process.env;
const dot = parse(await readFile(".env", "utf8"));
const secrets = JSON.parse(await readFile("infra/feed/.secrets/runtime.json", "utf8"));
const credentials = {
  accessKeyId: q.CLOUDRU_S3_ACCESS_KEY_ID,
  secretAccessKey: q.CLOUDRU_S3_SECRET_ACCESS_KEY,
};
const s3 = new S3Client({
  endpoint: q.CLOUDRU_S3_ENDPOINT,
  region: "ru-central-1",
  credentials,
  forcePathStyle: true,
  maxAttempts: 1,
});
const images = {
  gallery: "gafus.cr.cloud.ru/gafus-gallery-origin:stg-cdn-stable-20261012-05c5b67f",
  feed: "gafus.cr.cloud.ru/gafus-feed-origin:stg-cdn-stable-20261012-05c5b67f",
};
const envs = {
  gallery: {
    GALLERY_BUCKET: "gafus-gallery-private",
    GALLERY_S3_ENDPOINT: q.CLOUDRU_S3_ENDPOINT,
    GALLERY_S3_ACCESS_KEY_ID: credentials.accessKeyId,
    GALLERY_S3_SECRET_ACCESS_KEY: credentials.secretAccessKey,
    GALLERY_ORIGIN_SECRET: dot.TF_VAR_origin_secret,
    GALLERY_CDN_SECRET: dot.TF_VAR_cdn_secret,
    GALLERY_CDN_EDGE_TOKEN_VERIFIED: "true",
    GALLERY_CDN_EDGE_CACHE_HIT_VERIFIED: "true",
  },
  feed: {
    FEED_BUCKET: "gafus-feed-private",
    FEED_S3_ENDPOINT: q.CLOUDRU_S3_ENDPOINT,
    FEED_S3_ACCESS_KEY_ID: credentials.accessKeyId,
    FEED_S3_SECRET_ACCESS_KEY: credentials.secretAccessKey,
    FEED_ORIGIN_SECRET: secrets.origin_secret,
    FEED_CDN_SECRET: secrets.cdn_secret,
    FEED_CDN_EDGE_TOKEN_VERIFIED: "true",
    FEED_CDN_EDGE_CACHE_HIT_VERIFIED: "true",
  },
};
const require = createRequire(
  fileURLToPath(new URL("../../apps/gallery-cloud/package.json", import.meta.url)),
);
const sharp = require("sharp");
const webp = await sharp({
  create: { width: 8, height: 8, channels: 3, background: { r: 51, g: 120, b: 65 } },
})
  .webp()
  .toBuffer();
const uuid = randomUUID();
const fixtures = [
  {
    kind: "gallery",
    type: "image/webp",
    key: "albums/__gafus_cloudru_validation__/staging/photos/" + uuid + "/full.webp",
    body: webp,
  },
  {
    kind: "feed",
    type: "image/webp",
    key: "posts/__gafus_cloudru_validation__/staging/attachments/" + uuid + "/poster.webp",
    body: webp,
  },
  {
    kind: "feed",
    type: "video/mp2t",
    key: "posts/__gafus_cloudru_validation__/staging/attachments/" + uuid + "/hls/segment-000.ts",
    body: Buffer.alloc(376, 0x47),
  },
];
const ports = { gallery: 18851, feed: 18852 },
  names = [],
  created = [];
let ok = true;
const docker = (args, opt = {}) =>
  spawnSync("docker", args, { encoding: "utf8", timeout: 30000, ...opt });
async function check(f, method, headers = {}) {
  return fetch("http://127.0.0.1:" + ports[f.kind] + "/" + f.key, {
    method,
    headers,
    signal: AbortSignal.timeout(8500),
  });
}
try {
  for (const kind of ["gallery", "feed"]) {
    const name = "gafus-preprod-local-" + kind + "-" + uuid.slice(0, 8);
    const vars = envs[kind];
    const params = [
      "run",
      "--pull=never",
      "--rm",
      "-d",
      "--name",
      name,
      "--read-only",
      "--cap-drop=ALL",
      "--security-opt=no-new-privileges",
      "-p",
      "127.0.0.1:" + ports[kind] + ":8080",
    ];
    for (const v of Object.keys(vars)) params.push("-e", v);
    const result = docker([...params, images[kind]], { env: { ...q, ...vars } });
    if (result.status !== 0) throw Error("OCI_START_" + kind);
    names.push(name);
  }
  for (const f of fixtures) {
    const bucket = envs[f.kind][f.kind.toUpperCase() + "_BUCKET"];
    await s3.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: f.key,
        Body: f.body,
        ContentType: f.type,
        CacheControl: "private, no-store",
        IfNoneMatch: "*",
      }),
    );
    created.push({ bucket, key: f.key });
    const header = f.kind === "gallery" ? "x-gallery-origin-secret" : "x-feed-origin-secret";
    const h = { [header]: envs[f.kind][f.kind.toUpperCase() + "_ORIGIN_SECRET"] };
    let ready = false;
    for (let n = 0; n < 25; n++) {
      try {
        const r = await check(f, "HEAD", h);
        await r.body?.cancel();
        if (r.status === 200) {
          ready = true;
          break;
        }
      } catch {}
      await new Promise((done) => setTimeout(done, 400));
    }
    if (!ready) throw Error("ORIGIN_STARTUP_" + f.kind);
    const get = await check(f, "GET", h);
    const bytes = Buffer.from(await get.arrayBuffer());
    const full = get.status === 200 && bytes.equals(f.body);
    const range = await check(f, "GET", { ...h, range: "bytes=0-3" });
    const rb = Buffer.from(await range.arrayBuffer());
    const partial = range.status === 206 && rb.equals(f.body.subarray(0, 4));
    const head = await check(f, "HEAD", h);
    const headOk = head.status === 200;
    await head.body?.cancel();
    const bad = await check(f, "GET", { ...h, range: "bytes=999999-" });
    const badRange = bad.status === 416;
    await bad.body?.cancel();
    const anon = await check(f, "GET");
    const denied = anon.status === 403;
    await anon.body?.cancel();
    const cached = (get.headers.get("cache-control") ?? "").includes("public");
    console.log(
      JSON.stringify({
        scope: f.kind,
        type: f.type,
        full,
        partial,
        headOk,
        badRange,
        denied,
        cached,
      }),
    );
    if (![full, partial, headOk, badRange, denied, cached].every(Boolean)) ok = false;
  }
} catch (error) {
  console.log(JSON.stringify({ error: error?.message?.slice(0, 70) ?? "unknown" }));
  ok = false;
} finally {
  for (const f of created) {
    let deleted = false;
    try {
      await s3.send(new DeleteObjectCommand({ Bucket: f.bucket, Key: f.key }));
      try {
        await s3.send(new HeadObjectCommand({ Bucket: f.bucket, Key: f.key }));
      } catch (e) {
        deleted = e?.$metadata?.httpStatusCode === 404;
      }
    } catch {}
    console.log(JSON.stringify({ syntheticRemoved: deleted }));
    if (!deleted) ok = false;
  }
  for (const name of names) {
    const r = docker(["stop", "-t", "2", name]);
    if (r.status !== 0) ok = false;
  }
  s3.destroy();
}
console.log("LOCAL_OCI_ACCEPTANCE=" + (ok ? "PASS" : "FAILED"));
if (!ok) process.exitCode = 1;
