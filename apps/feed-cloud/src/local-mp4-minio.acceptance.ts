/** Opt-in exact local MinIO integration: create REAL progressive MP4/poster,
 * stream to isolated feed-test bucket, verify HTTP Range & MIME, delete ONLY own
 * UUID-scoped test keys. No DB, remote CDN or production resources touched.
 */
import { randomUUID, createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdtemp, readFile, realpath, rm, stat } from "node:fs/promises";
import { readFileSync, realpathSync, statSync } from "node:fs";
import { join } from "node:path";
import { GetObjectCommand, HeadObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { createFeedCommandRunner, processFeedV2Video, processFeedV2Image } from "@gafus/feed-cloud";
import sharp from "sharp";
import { sharpFeedEngine } from "./sharp-engine.js";
import { createFeedCloudObjects } from "./objects.js";
const root = "/Users/asmtv1/Desktop/gafus-refactor";
const scratch = root + "/.local-pg-scratch";
const credDir = scratch + "/nonprod-s3";
const credentialsFile = credDir + "/credentials.json";
function assert(ok: unknown, reason: string): asserts ok {
  if (!ok) throw new Error("FEED_V2_MINIO_DENIED_" + reason);
}
assert(realpathSync(root) === root && realpathSync(process.cwd()) === root + "/apps/feed-cloud", "ROOT");
assert(realpathSync(credDir) === credDir && realpathSync(credentialsFile) === credentialsFile &&
  (statSync(credDir).mode & 0o777) === 0o700 &&
  (statSync(credentialsFile).mode & 0o777) === 0o600, "PRIVATE_CREDENTIALS");
const creds = JSON.parse(readFileSync(credentialsFile, "utf8")) as
  { accessKeyId: string; secretAccessKey: string };
assert(/^[A-Za-z0-9]{20,64}$/.test(creds.accessKeyId) &&
  /^[A-Za-z0-9]{32,128}$/.test(creds.secretAccessKey), "LOCAL_CREDS");
Object.assign(process.env, {
  NODE_ENV: "development", GAFUS_LOCAL_ISOLATED_API: "1",
  GAFUS_ISOLATED_NONPROD_S3: "enabled",
  GAFUS_ISOLATED_S3_ENDPOINT: "http://127.0.0.1:9000",
  GAFUS_ISOLATED_S3_FEED_BUCKET: "gafus-refactor-feed-test",
  GAFUS_ISOLATED_S3_GALLERY_BUCKET: "gafus-refactor-gallery-test",
});
const bucket = "gafus-refactor-feed-test";
const client = new S3Client({ endpoint: "http://127.0.0.1:9000", region: "us-east-1",
  credentials: creds, forcePathStyle: true, maxAttempts: 1,
  requestChecksumCalculation: "WHEN_REQUIRED", responseChecksumValidation: "WHEN_REQUIRED" });
const objects = createFeedCloudObjects();
const id = "qa_" + randomUUID().replaceAll("-", "");
const videoKey = `media/v2/${id}/v1/video/360.mp4`;
const posterKey = `media/v2/${id}/v1/poster.webp`;
const ownKeys: string[] = [];
const dir = await mkdtemp(join(scratch, ".feed-v2-real-s3-"));
try {
  assert((await realpath(dir)).startsWith(scratch + "/"), "TEMP_DIRECTORY");
  const source = join(dir, "input.mp4");
  execFileSync("ffmpeg", ["-hide_banner", "-nostdin", "-loglevel", "error", "-y",
    "-f", "lavfi", "-i", "testsrc=size=640x360:rate=24",
    "-f", "lavfi", "-i", "sine=frequency=440:sample_rate=44100",
    "-t", "1", "-threads", "2", "-c:v", "libx264", "-pix_fmt", "yuv420p",
    "-c:a", "aac", "-shortest", source], { cwd: dir, timeout: 60000 });
  const encoded = await processFeedV2Video(source, join(dir, "output"),
    createFeedCommandRunner({ timeoutMs: 60_000 }));
  assert(encoded.mp4.length === 1 && encoded.mp4[0]?.quality === 360, "360_RENDITION");
  const mp4File = encoded.mp4[0]!.path;
  const before = await stat(mp4File);
  assert(before.size > 1000, "MP4_FILE");
  const poster = await readFile(encoded.poster);
  const abort = new AbortController();
  ownKeys.push(videoKey);
  await objects.createFile(videoKey, mp4File, abort.signal);
  ownKeys.push(posterKey);
  await objects.create(posterKey, poster, "image/webp", abort.signal);
  const head = await client.send(new HeadObjectCommand({ Bucket: bucket, Key: videoKey }));
  assert(head.ContentLength === before.size && head.ContentType === "video/mp4", "MP4_HEAD");
  const result = await client.send(new GetObjectCommand({ Bucket: bucket, Key: videoKey,
    Range: "bytes=0-127" }));
  assert(result.$metadata.httpStatusCode === 206 && result.ContentRange === `bytes 0-127/${before.size}` &&
    result.ContentLength === 128 && result.ContentType === "video/mp4", "REAL_MINIO_RANGE");
  const bytes = result.Body ? Buffer.from(await result.Body.transformToByteArray()) : Buffer.alloc(0);
  assert(bytes.length === 128 && bytes.toString("latin1",4,8) === "ftyp", "MP4_FTYP");
  const image = await client.send(new GetObjectCommand({ Bucket: bucket, Key: posterKey }));
  const posterBytes = image.Body ? Buffer.from(await image.Body.transformToByteArray()) : Buffer.alloc(0);
  assert(image.ContentType === "image/webp" && posterBytes.toString("latin1",8,12) === "WEBP", "POSTER_WEBP");
  const srcImage = await sharp({create:{width:1000,height:800,channels:3,background:"#556655"}})
    .jpeg().withMetadata({orientation:6}).toBuffer();
  const images = await processFeedV2Image(srcImage, sharpFeedEngine);
  const outputs = [
    {key:`media/v2/${id}/v1/image/s.webp`, bytes:images.small.bytes},
    {key:`media/v2/${id}/v1/image/m.webp`, bytes:images.medium.bytes},
    {key:`media/v2/${id}/v1/image/l.webp`, bytes:images.large.bytes},
  ];
  for (const output of outputs) {
    ownKeys.push(output.key);
    await objects.create(output.key, output.bytes, "image/webp", abort.signal);
    const signed = await client.send(new GetObjectCommand({Bucket:bucket,Key:output.key}));
    const payload = signed.Body ? Buffer.from(await signed.Body.transformToByteArray()) : Buffer.alloc(0);
    assert(signed.ContentType === "image/webp" && payload.length === output.bytes.length &&
      payload.toString("latin1",0,4)==="RIFF" && payload.toString("latin1",8,12)==="WEBP",
      "THREE_REAL_WEBP_OBJECTS");
    const decoded = await sharp(payload).metadata();
    assert(decoded.exif === undefined && decoded.format === "webp", "PHOTO_METADATA_REMOVED");
  }
  const sha = createHash("sha256").update(bytes).digest("hex");
  console.log("FEED_V2_REAL_MINIO_RANGE_PASS", JSON.stringify({
    mp4Size: before.size, rangeStatus: result.$metadata.httpStatusCode,
    returnedRangeBytes: bytes.length, posterWebpBytes: posterBytes.length,
    localOnly: true, noLegacyHls: true, webpUploaded: outputs.length,
    requestDigestPrefix: sha.slice(0,8),
  }));
} finally {
  // Own UUID-scoped keys only: no user objects, no DB rows, no unknown paths.
  for (const key of [...ownKeys].reverse()) {
    if (key.startsWith(`media/v2/${id}/v1/`)) await objects.delete(key, new AbortController().signal);
  }
  if ((await realpath(dir)).startsWith(scratch + "/")) await rm(dir, { recursive: true, force: false });
  client.destroy();
}
