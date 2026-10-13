/**
 * GitHub main release: Yandex CDN -> warmed Cloud.ru Origins, with verified rollback.
 * Runs ONLY after production Web/API and Cloudru containers are healthy.
 * --plan: pure, --preflight: read only, --prepare: create unused origin groups,
 * --activate: roll out with automatic rollback on failure.
 */
import { spawnSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import { readFile, writeFile, unlink } from "node:fs/promises";
import { verifyStableCdnGet } from "./cdn-stability.mjs";
import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
  HeadObjectCommand,
} from "@aws-sdk/client-s3";
const mode = process.argv[2] ?? "--plan";
if (!["--plan", "--preflight", "--prepare", "--activate"].includes(mode))
  throw Error("CDN_INVALID_ACTION");
const specs = [
  {
    kind: "gallery",
    id: "bc8rorv3vgbgax3xesyn",
    host: "gallery-dev.gafus.ru",
    origin: "gafus-gallery-origin.containerapps.ru",
    groupName: "gafus-gallery-cloudru-production",
    path: (id) => "albums/__gafus_cloudru_validation__/staging/photos/" + id + "/full.webp",
    bucket: "gafus-gallery-private",
  },
  {
    kind: "feed",
    id: "bc8ru2x6mcqxwcl6a7vj",
    host: "feed.gafus.ru",
    origin: "gafus-feed-origin.containerapps.ru",
    groupName: "gafus-feed-cloudru-production",
    path: (id) => "posts/__gafus_cloudru_validation__/staging/attachments/" + id + "/poster.webp",
    bucket: "gafus-feed-private",
  },
];
if (mode === "--plan") {
  console.log(
    JSON.stringify({
      mode,
      changes: false,
      resources: specs.map(({ host, origin, groupName }) => ({ host, origin, groupName })),
      validation: [
        "current signer+header+TLS",
        "direct Cloudru Origin via secret header",
        "CDN propagation",
        "GET/HEAD/Range",
        "expired and forged signatures",
        "synthetic S3 cleanup",
        "automatic Yandex CDN rollback",
      ],
    }),
  );
  process.exit(0);
}
const e = process.env;
if (
  e.GITHUB_REF !== "refs/heads/main" ||
  e.GITHUB_EVENT_NAME !== "push" ||
  e.CLOUDRU_CDN_RELEASE_CONFIRM !== "reviewed-main-cloudru-cdn-cutover"
)
  throw Error("CDN_CUTOVER_NOT_AUTHORIZED");
if (
  e.CLOUDRU_S3_ENDPOINT !== "https://s3.cloud.ru" ||
  e.YC_CDN_FOLDER_ID !== "b1gjbsvfnd1fl68k43g6"
)
  throw Error("CDN_WRONG_FOLDER_OR_S3");
for (const x of [
  "GALLERY_CDN_SECRET",
  "FEED_CDN_SECRET",
  "GALLERY_ORIGIN_SECRET",
  "FEED_ORIGIN_SECRET",
  "CLOUDRU_S3_ACCESS_KEY_ID",
  "CLOUDRU_S3_SECRET_ACCESS_KEY",
])
  if (!e[x] || e[x].length < 10) throw Error("CDN_MISSING_" + x);
for (const x of specs) {
  x.signer = e[x.kind.toUpperCase() + "_CDN_SECRET"];
  x.headerSecret = e[x.kind.toUpperCase() + "_ORIGIN_SECRET"];
  if (!/^[A-Za-z0-9_-]{24,32}$/.test(x.signer) || Buffer.byteLength(x.headerSecret) < 32)
    throw Error("CDN_INVALID_SCOPE_SECRETS");
}
function yc(args) {
  const r = spawnSync("yc", args.concat(["--format=json"]), {
    encoding: "utf8",
    timeout: 55000,
    maxBuffer: 3 * 1024 * 1024,
  });
  if (r.status !== 0) {
    // Never log raw CLI output: resource options can contain signing/header secrets.
    const diagnostic = (r.stderr ?? "") + " " + (r.error?.code ?? "");
    const code = diagnostic.match(/code\s*=\s*([A-Za-z]+)/)?.[1] ??
      ["PERMISSION_DENIED", "UNAUTHENTICATED", "PermissionDenied", "Unauthenticated",
       "Unavailable", "DeadlineExceeded", "ETIMEDOUT", "ENOENT"]
        .find((value) => diagnostic.includes(value)) ?? "UNKNOWN";
    throw Error("YC_CDN_COMMAND_FAILED_" + args.slice(0, 2).join("_") +
      "_" + code + "_EXIT_" + r.status);
  }
  return r.stdout?.trim() ? JSON.parse(r.stdout) : {};
}
const current = (x) =>
  yc(["cdn", "resource", "get", "--id", x.id, "--folder-id", e.YC_CDN_FOLDER_ID]);
const detail = (x, r) => {
  const o = r.options ?? {};
  if (
    r.cname !== x.host ||
    r.ssl_certificate?.status !== "READY" ||
    r.active !== true ||
    o.secure_key?.enabled !== true ||
    o.secure_key.key !== x.signer ||
    o.static_request_headers?.enabled !== true ||
    o.static_request_headers.value?.["x-" + x.kind + "-origin-secret"] !== x.headerSecret
  )
    throw Error("CDN_SIGNATURE_TLS_OR_SECRET_MISMATCH_" + x.kind);
  return {
    group: r.origin_group_id,
    host: o.host_options?.host?.value ?? null,
    sni: o.custom_server_name?.value ?? null,
  };
};
function getGroup(x) {
  const list = yc(["cdn", "origin-group", "list", "--folder-id", e.YC_CDN_FOLDER_ID]);
  const matches = list.filter((y) => y.name === x.groupName);
  if (matches.length > 1) throw Error("CDN_DUPLICATE_TARGET_GROUP");
  if (matches.length === 0) return null;
  const group = yc([
    "cdn",
    "origin-group",
    "get",
    "--id",
    matches[0].id,
    "--folder-id",
    e.YC_CDN_FOLDER_ID,
  ]);
  if (group.origins?.length !== 1 || group.origins[0].source !== x.origin)
    throw Error("CDN_GROUP_TARGET_IS_UNTRUSTED_" + x.kind);
  return group.id;
}
function setGroup(x, group, hostname) {
  yc([
    "cdn",
    "resource",
    "update",
    "--id",
    x.id,
    "--folder-id",
    e.YC_CDN_FOLDER_ID,
    "--origin-group-id",
    String(group),
    "--host-header",
    hostname,
    "--custom-server-name",
    hostname,
    "--origin-protocol",
    "HTTPS",
  ]);
  const d = detail(x, current(x));
  if (String(d.group) !== String(group) || d.host !== hostname || d.sni !== hostname)
    throw Error("CDN_UPDATE_NOT_CONFIRMED_" + x.kind);
}
for (const x of specs) {
  x.original = detail(x, current(x));
  x.targetGroup = getGroup(x);
  if (mode === "--preflight") {
    console.log(
      JSON.stringify({
        cdn: x.host,
        securityVerified: true,
        originalGroup: x.original.group,
        targetGroupExists: x.targetGroup !== null,
        desiredOrigin: x.origin,
      }),
    );
  }
}
if (mode === "--preflight") process.exit(0);
if (mode === "--prepare") {
  // Create but DO NOT attach both groups, before the application deploy starts.
  // A permission failure must fail here instead of leaving a half-switched CDN.
  for (const x of specs) {
    if (x.targetGroup) continue;
    const group = yc([
      "cdn",
      "origin-group",
      "create",
      "--name",
      x.groupName,
      "--origin",
      "source=" + x.origin + ",enabled=true",
      "--folder-id",
      e.YC_CDN_FOLDER_ID,
    ]);
    if (!group.id || String(getGroup(x)) !== String(group.id))
      throw Error("UNVERIFIED_CDN_GROUP_CREATION_" + x.kind);
    console.log(JSON.stringify({ cdn: x.host, unusedOriginGroupPrepared: group.id }));
  }
  console.log("CLOUDRU_CDN_ORIGIN_GROUPS_PREPARED=true");
  process.exit(0);
}

const s3 = new S3Client({
  endpoint: e.CLOUDRU_S3_ENDPOINT,
  region: "ru-central-1",
  forcePathStyle: true,
  maxAttempts: 3,
  credentials: {
    accessKeyId: e.CLOUDRU_S3_ACCESS_KEY_ID,
    secretAccessKey: e.CLOUDRU_S3_SECRET_ACCESS_KEY,
  },
});
const keys = [],
  switched = [],
  stateFile = process.env.RUNNER_TEMP
    ? process.env.RUNNER_TEMP + "/gafus-cdn-rollback.json"
    : "/tmp/gafus-cdn-rollback.json";
let committed = false;
function signed(x, path, expires) {
  const hash = createHash("md5")
    .update(String(expires) + path + " " + x.signer)
    .digest("base64url");
  return "https://" + x.host + path + "?md5=" + hash + "&expires=" + expires;
}
try {
  for (const x of specs) {
    const tempId = randomUUID();
    x.key = x.path(tempId);
    // Upload an actual decodable WebP rather than arbitrary bytes under a WebP MIME type.
    const require = createRequire(
      new URL("../../apps/gallery-cloud/package.json", import.meta.url),
    );
    const sharp = require("sharp");
    x.bytes = await sharp({
      create: { width: 16, height: 16, channels: 3, background: { r: 55, g: 119, b: 72 } },
    })
      .webp()
      .toBuffer();
    keys.push(x);
    await s3.send(
      new PutObjectCommand({
        Bucket: x.bucket,
        Key: x.key,
        Body: x.bytes,
        ContentType: "image/webp",
        IfNoneMatch: "*",
        CacheControl: "public, max-age=90",
      }),
    );
    const url = "https://" + x.origin + "/" + x.key;
    const r = await fetch(url, {
      headers: { ["x-" + x.kind + "-origin-secret"]: x.headerSecret },
      signal: AbortSignal.timeout(12000),
    });
    if (r.status !== 200 || !Buffer.from(await r.arrayBuffer()).equals(x.bytes))
      throw Error("CDN_DIRECT_ORIGIN_WRONG_BYTES_" + x.kind);
    const denial = await fetch(url, { signal: AbortSignal.timeout(12000) });
    if (denial.status !== 403) throw Error("CDN_ORIGIN_ANONYMOUSLY_READABLE_" + x.kind);
  }
  // Persist all original states before modifying the first CDN resource.
  await writeFile(
    stateFile,
    JSON.stringify(
      specs.map((x) => ({
        kind: x.kind,
        id: x.id,
        group: x.original.group,
        host: x.original.host,
        sni: x.original.sni,
      })),
    ),
    { flag: "wx", mode: 0o600 },
  );
  for (const x of specs) {
    if (!x.targetGroup) {
      const group = yc([
        "cdn",
        "origin-group",
        "create",
        "--name",
        x.groupName,
        "--origin",
        "source=" + x.origin + ",enabled=true",
        "--folder-id",
        e.YC_CDN_FOLDER_ID,
      ]);
      if (!group?.id) throw Error("CDN_GROUP_CREATE_FAILED_" + x.kind);
      x.targetGroup = getGroup(x);
    }
    if (!x.targetGroup) throw Error("CDN_TARGET_GROUP_NOT_READY_" + x.kind);
    if (
      String(x.original.group) === String(x.targetGroup) &&
      x.original.host === x.origin &&
      x.original.sni === x.origin
    )
      console.log(JSON.stringify({ cdn: x.host, alreadyActive: true }));
    else {
      // Record intent before write, including if YC update returns error after applying.
      switched.push(x);
      setGroup(x, x.targetGroup, x.origin);
    }
    const path = "/" + x.key;
    let ready = false;
    for (let i = 0; i < 110; i++) {
      try {
        const u = signed(x, path, Math.floor(Date.now() / 1000) + 150);
        const r = await fetch(u, { signal: AbortSignal.timeout(15000), cache: "no-store" });
        if (r.status === 200 && Buffer.from(await r.arrayBuffer()).equals(x.bytes)) {
          ready = true;
          break;
        }
      } catch {}
      await new Promise((done) => setTimeout(done, 4000));
    }
    if (!ready) throw Error("CDN_EDGE_PROPAGATION_FAILED_" + x.kind);
    // Origin propagation can briefly return CDN 5xx even after its first 200.
    // Require 15 consecutive byte-exact hits, bounded to 35 attempts.
    // A 403/404/redirect or wrong bytes still fail immediately and roll back.
    const stable = await verifyStableCdnGet({
      kind: x.kind,
      expectedBytes: x.bytes,
      urlForAttempt: () => signed(x, path, Math.floor(Date.now() / 1000) + 150),
    });
    console.log(JSON.stringify({
      cdn: x.host,
      stage: "edge-stable",
      samples: stable.samples,
      attempts: stable.attempts,
      transientFailures: stable.transientFailures,
    }));
    const expires = Math.floor(Date.now() / 1000) + 150,
      u = signed(x, path, expires);
    const h = await fetch(u, { method: "HEAD", signal: AbortSignal.timeout(11000) });
    if (h.status !== 200) throw Error("CDN_HEAD_FAIL_" + x.kind);
    const range = await fetch(u, {
      headers: { Range: "bytes=0-3" },
      signal: AbortSignal.timeout(11000),
    });
    if (
      range.status !== 206 ||
      !Buffer.from(await range.arrayBuffer()).equals(x.bytes.subarray(0, 4))
    )
      throw Error("CDN_RANGE_FAIL_" + x.kind);
    const bad = await fetch(
      signed(x, path, expires).replace(/md5=[^&]+/, "md5=" + "A".repeat(22)),
      { signal: AbortSignal.timeout(11000) },
    );
    if (bad.status !== 403) throw Error("CDN_TAMPERED_SIGNATURE_ACCEPTED_" + x.kind);
    const expired = await fetch(signed(x, path, Math.floor(Date.now() / 1000) - 10), {
      signal: AbortSignal.timeout(11000),
    });
    if (![403, 410].includes(expired.status))
      throw Error("CDN_EXPIRED_SIGNATURE_ACCEPTED_" + x.kind);
    console.log(
      JSON.stringify({
        cdn: x.host,
        correctOrigin: true,
        samples: 15,
        head: 200,
        range: 206,
        badSignatureDenied: true,
        expiredSignatureDenied: true,
      }),
    );
    if (x.kind === "feed") {
      // Video CDN acceptance: real FFmpeg MPEG-TS bytes under owner-scoped HLS key.
      const segmentPath = "/" + x.key.replace(/poster\.webp$/, "hls/segment-000.ts");
      if (!segmentPath.endsWith("/hls/segment-000.ts")) throw Error("INVALID_HLS_TEST_PATH");
      const ffmpeg = spawnSync(
        "ffmpeg",
        [
          "-hide_banner",
          "-nostdin",
          "-loglevel",
          "error",
          "-f",
          "lavfi",
          "-i",
          "testsrc=size=128x72:rate=16:duration=1",
          "-c:v",
          "libx264",
          "-preset",
          "ultrafast",
          "-pix_fmt",
          "yuv420p",
          "-an",
          "-f",
          "mpegts",
          "pipe:1",
        ],
        { encoding: null, timeout: 40000, maxBuffer: 1700000 },
      );
      if (
        ffmpeg.status !== 0 ||
        !ffmpeg.stdout?.length ||
        ffmpeg.stdout[0] !== 0x47 ||
        ffmpeg.stdout.byteLength % 188 !== 0 ||
        ffmpeg.stdout.byteLength > 1750000
      )
        throw Error("PRODUCTION_HLS_FIXTURE_NOT_MPEGTS");
      const fixture = {
        kind: "feed-segment",
        key: segmentPath.slice(1),
        bucket: x.bucket,
        bytes: ffmpeg.stdout,
      };
      keys.push(fixture);
      await s3.send(
        new PutObjectCommand({
          Bucket: fixture.bucket,
          Key: fixture.key,
          Body: fixture.bytes,
          ContentType: "video/mp2t",
          CacheControl: "public, max-age=90",
          IfNoneMatch: "*",
        }),
      );
      const origin = await fetch("https://" + x.origin + segmentPath, {
        headers: {
          "x-feed-origin-secret": x.headerSecret,
        },
        signal: AbortSignal.timeout(11000),
      });
      if (origin.status !== 200 || !Buffer.from(await origin.arrayBuffer()).equals(fixture.bytes))
        throw Error("PRODUCTION_HLS_DIRECT_ORIGIN_NOT_READY");
      let ready = false;
      for (let attempt = 0; attempt < 80; attempt++) {
        try {
          const resp = await fetch(signed(x, segmentPath, Math.floor(Date.now() / 1000) + 160), {
            signal: AbortSignal.timeout(13000),
          });
          if (resp.status === 200 && Buffer.from(await resp.arrayBuffer()).equals(fixture.bytes)) {
            ready = true;
            break;
          }
        } catch {}
        await new Promise((done) => setTimeout(done, 4000));
      }
      if (!ready) throw Error("PRODUCTION_HLS_CDN_NOT_READY");
      const segmentUrl = signed(x, segmentPath, Math.floor(Date.now() / 1000) + 145);
      for (let k = 0; k < 15; k++) {
        const check = await fetch(segmentUrl, { signal: AbortSignal.timeout(11000) });
        if (check.status !== 200 || !Buffer.from(await check.arrayBuffer()).equals(fixture.bytes))
          throw Error("PRODUCTION_HLS_CDN_UNSTABLE");
      }
      const h = await fetch(segmentUrl, { method: "HEAD", signal: AbortSignal.timeout(11000) });
      const r = await fetch(segmentUrl, {
        headers: { Range: "bytes=0-3" },
        signal: AbortSignal.timeout(11000),
      });
      if (
        h.status !== 200 ||
        r.status !== 206 ||
        !Buffer.from(await r.arrayBuffer()).equals(fixture.bytes.subarray(0, 4))
      )
        throw Error("PRODUCTION_HLS_CDN_HEAD_RANGE_FAILED");
      const forged = await fetch(segmentUrl.replace(/md5=[^&]+/, "md5=" + "A".repeat(22)), {
        signal: AbortSignal.timeout(11000),
      });
      const expired = await fetch(signed(x, segmentPath, Math.floor(Date.now() / 1000) - 10), {
        signal: AbortSignal.timeout(11000),
      });
      if (forged.status !== 403 || ![403, 410].includes(expired.status))
        throw Error("PRODUCTION_HLS_CDN_SIGNATURE_FAILED");
      console.log("PRODUCTION_SIGNED_FEED_HLS_MPEGTS=PASS");
    }
  }
  // Final application health belongs to this transaction. A failure must
  // roll the CDN back BEFORE the action can report success to GitHub.
  for (const endpoint of ["https://gafus.ru/api/ping", "https://api.gafus.ru/ready"]) {
    let healthy = false;
    for (let attempt = 0; attempt < 5; attempt++) {
      try {
        const check = await fetch(endpoint, {
          signal: AbortSignal.timeout(12000),
          cache: "no-store",
        });
        if (check.ok) {
          healthy = true;
          break;
        }
      } catch {}
      await new Promise((resolve) => setTimeout(resolve, 3000));
    }
    if (!healthy) throw Error("CLOUDRU_POSTCUTOVER_APP_UNREADY");
  }
  committed = true;
  console.log("CLOUDRU_YANDEX_CDN_CUTOVER=PASS");
} finally {
  if (!committed) {
    for (const x of switched.reverse()) {
      try {
        if (x.original.sni) {
          yc([
            "cdn",
            "resource",
            "update",
            "--id",
            x.id,
            "--folder-id",
            e.YC_CDN_FOLDER_ID,
            "--origin-group-id",
            String(x.original.group),
            "--host-header",
            x.original.host,
            "--custom-server-name",
            x.original.sni,
            "--origin-protocol",
            "HTTPS",
          ]);
        } else {
          yc([
            "cdn",
            "resource",
            "update",
            "--id",
            x.id,
            "--folder-id",
            e.YC_CDN_FOLDER_ID,
            "--origin-group-id",
            String(x.original.group),
            "--host-header",
            x.original.host,
            "--clear-custom-server-name",
            "--origin-protocol",
            "HTTPS",
          ]);
        }
        console.log("CDN_ROLLED_BACK_" + x.kind);
      } catch {
        process.exitCode = 1;
        console.error("CDN_MANUAL_ROLLBACK_REQUIRED_" + x.kind);
      }
    }
  }
  for (const x of keys) {
    let deleted = false;
    try {
      await s3.send(new DeleteObjectCommand({ Bucket: x.bucket, Key: x.key }));
      await s3.send(new HeadObjectCommand({ Bucket: x.bucket, Key: x.key }));
    } catch (error) {
      deleted = error?.$metadata?.httpStatusCode === 404;
    }
    if (!deleted) {
      // Once CDN and API are healthy, a synthetic fixture cleanup failure must
      // not roll back a live release (that would leave CDN and runtime mismatched).
      // The unique validation key does not belong to any user and its URL expires.
      console.error("CDN_SYNTHETIC_CLEANUP_INCOMPLETE_" + x.kind);
      if (!committed) process.exitCode = 1;
    }
  }
  s3.destroy();
  if (committed) await unlink(stateFile).catch(() => {});
}
