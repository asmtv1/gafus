#!/usr/bin/env node
/**
 * Immutable Cloud.ru object upload with authenticated S3 + anonymous public S3 readback.
 * Only preview by default; no DB publication, source patches or sourcemaps.
 * Production use requires an independently approved protected CI environment.
 */
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import {
  S3Client, HeadObjectCommand, GetObjectCommand, PutObjectCommand,
} from "@aws-sdk/client-s3";

const hex = (bytes) => crypto.createHash("sha256").update(bytes).digest("hex");
const KEY = /^[a-f0-9]{64}\.[a-z0-9]{2,8}$/;
const PREFIX = /^ota\/(?:preview|production)\/[a-z0-9_-]{1,64}\/[a-z0-9_.-]{1,100}\/(?:ios|android)\/assets$/;

export function checkOtaUploadPlan({ directory, manifest, inventory, prefix, publicCdnBase, environment }) {
  if (environment !== "preview" && environment !== "production")
    throw Error("INVALID_OTA_UPLOAD_ENVIRONMENT");
  if (!PREFIX.test(prefix) || !prefix.startsWith(`ota/${environment}/`))
    throw Error("INVALID_OTA_S3_PREFIX");
  const base = new URL(publicCdnBase);
  if (base.protocol !== "https:" || base.username || base.password || base.search || base.hash)
    throw Error("INVALID_OTA_CDN_BASE");
  if (!publicCdnBase.endsWith("/")) throw Error("OTA_CDN_BASE_MUST_END_WITH_SLASH");
  if (!base.pathname.endsWith(`/${prefix}/`)) throw Error("OTA_CDN_ORIGIN_PATH_MISMATCH");
  if (!Array.isArray(inventory) || inventory.length === 0 || inventory.length > 10000)
    throw Error("INVALID_OTA_UPLOAD_ASSETS");
  const assetPaths = new Set();
  const targets = [];
  for (const item of inventory) {
    if (!KEY.test(item.immutableFile) || !/^[a-f0-9]{64}$/.test(item.sha256) ||
      !Number.isSafeInteger(item.sizeBytes) || item.sizeBytes <= 0 ||
      !/^[a-z0-9/+._-]{1,128}$/.test(item.contentType))
      throw Error("INVALID_OTA_ASSET_RECORD");
    const assetPath = path.join(directory, "assets", item.immutableFile);
    if (!fs.statSync(assetPath).isFile() || hex(fs.readFileSync(assetPath)) !== item.sha256 ||
      fs.statSync(assetPath).size !== item.sizeBytes)
      throw Error("OTA_ASSET_HASH_MISMATCH");
    if (assetPaths.has(item.immutableFile)) continue;
    assetPaths.add(item.immutableFile);
    targets.push({
      key: `${prefix}/${item.immutableFile}`,
      assetPath,
      sha256: item.sha256,
      mime: item.contentType,
      size: item.sizeBytes,
      url: new URL(item.immutableFile, base).href,
    });
  }
  const manifestAssets = [manifest.launchAsset, ...manifest.assets];
  if (manifestAssets.length !== inventory.length ||
    !manifestAssets.every((asset) => assetPaths.has(asset.url.slice(asset.url.lastIndexOf("/")+1)) &&
      asset.url.startsWith(publicCdnBase)))
    throw Error("OTA_MANIFEST_CDN_ASSET_MISMATCH");
  return targets;
}

/** Public assets are served from Cloud.ru S3 directly, never through a CDN. */
export function assertDirectCloudRuAssetOrigin({ bucket, prefix, publicAssetBase }) {
  if (!/^[a-z0-9][a-z0-9.-]{2,62}$/.test(bucket) ||
      publicAssetBase !== `https://global.s3.cloud.ru/${bucket}/${prefix}/`)
    throw Error("OTA_PUBLIC_S3_ORIGIN_BUCKET_MISMATCH");
}

/** Signed OTA publisher may only write to this isolated Cloud.ru S3 bucket. */
export function assertCloudRuOtaPublisherConfig({ endpoint, region, bucket }) {
  if (endpoint !== "https://s3.cloud.ru" && endpoint !== "https://s3.cloud.ru/" ||
      region !== "ru-central-1" || bucket !== "gafus-ota-updates")
    throw Error("UNTRUSTED_OTA_CLOUD_RU_CONFIGURATION");
}

export async function uploadImmutableOtaAssets({ client, bucket, targets, verifyCdn = true, request = fetch }) {
  if (!/^[a-z0-9][a-z0-9.-]{2,62}$/.test(bucket)) throw Error("INVALID_OTA_BUCKET");
  const report = [];
  for (const target of targets) {
    const bytes = fs.readFileSync(target.assetPath);
    if (hex(bytes) !== target.sha256) throw Error("ASSET_CHANGED_AFTER_PREPARATION");
    let written = false;
    try {
      await client.send(new PutObjectCommand({
        Bucket: bucket, Key: target.key, Body: bytes, ContentType: target.mime,
        ContentLength: bytes.length, CacheControl: "public, max-age=31536000, immutable",
        Metadata: { sha256: target.sha256 }, IfNoneMatch: "*",
      }));
      written = true;
    } catch (error) {
      // A collision must be proved identical by reading it; no blind overwrite.
      if (!(error && typeof error === "object" &&
        (error.$metadata?.httpStatusCode === 412 || error.name === "PreconditionFailed"))) throw error;
    }
    const head = await client.send(new HeadObjectCommand({ Bucket: bucket, Key: target.key }));
    if (Number(head.ContentLength) !== target.size || head.ContentType !== target.mime ||
      head.Metadata?.sha256 !== target.sha256)
      throw Error("S3_ASSET_HEAD_MISMATCH");
    const body = await client.send(new GetObjectCommand({ Bucket: bucket, Key: target.key }));
    const readBytes = Buffer.from(await body.Body.transformToByteArray());
    if (hex(readBytes) !== target.sha256) throw Error("S3_ASSET_BODY_MISMATCH");
    if (verifyCdn) {
      // Compatibility name `cdnVerified` is retained in the CI receipt schema;
      // this request is a direct anonymous S3 GET (no CDN).
      const res = await request(target.url, { method: "GET", redirect: "error", cache: "no-store" });
      if (!res.ok || res.headers.get("content-type")?.split(";")[0] !== target.mime ||
        hex(Buffer.from(await res.arrayBuffer())) !== target.sha256)
        throw Error("CDN_ASSET_READBACK_MISMATCH");
    }
    report.push({ key: target.key, sha256: target.sha256, size: target.size, written,
      s3Verified: true, cdnVerified: verifyCdn });
  }
  return report;
}

async function main() {
  const args = process.argv.slice(2);
  if (args.length !== 2 || args[0] !== "--directory") {
    console.error("Usage: node upload-mobile-ota-assets.mjs --directory <prepared-artifact-dir>");
    process.exitCode = 2;
    return;
  }
  const directory = path.resolve(args[1]);
  const metadata = JSON.parse(fs.readFileSync(path.join(directory,"release-metadata.json"),"utf8"));
  const manifestBytes = fs.readFileSync(path.join(directory,"manifest.json"));
  if (hex(manifestBytes) !== metadata.manifestSha256) throw Error("OTA_SIGNED_MANIFEST_CHANGED");
  const manifest = JSON.parse(manifestBytes.toString("utf8"));
  const environment = metadata.environment;
  const prefix = process.env.OTA_S3_PREFIX;
  // OTA_ASSET_BASE points directly to Cloud.ru S3; the old CDN variable stays for compatibility.
  const publicCdnBase = process.env.OTA_ASSET_BASE ?? process.env.OTA_CDN_BASE;
  const targets = checkOtaUploadPlan({ directory, manifest, inventory: metadata.inventory,
    prefix, publicCdnBase, environment });
  if (process.env.OTA_UPLOAD_EXECUTE !== "1") {
    console.log(JSON.stringify({ state:"DRY_RUN_NOT_UPLOADED", count: targets.length,
      bytes:targets.reduce((sum,item)=>sum+item.size,0), environment }));
    return;
  }
  if (environment === "production" &&
      (process.env.CI !== "true" || process.env.GAFUS_OTA_PRODUCTION_APPROVED !== "true"))
    throw Error("PRODUCTION_OTA_REQUIRES_PROTECTED_CI_APPROVAL");
  // Never upload an OTA bundle whose signed manifest would send devices to a
  // different/publicly writable bucket. The public origin is the direct S3
  // endpoint, not a CDN; global name is required for anonymous GETs.
  if (!(environment === "preview" && process.env.GAFUS_OTA_LOCAL_TEST === "1"))
    assertDirectCloudRuAssetOrigin({ bucket: process.env.OTA_S3_BUCKET,
      prefix, publicAssetBase: publicCdnBase });
  const endpoint = process.env.OTA_S3_ENDPOINT ?? "";
  const region = process.env.OTA_S3_REGION || "ru-central-1";
  const localTest = environment === "preview" && process.env.GAFUS_OTA_LOCAL_TEST === "1";
  if (localTest) {
    let endpointUrl;
    try { endpointUrl = new URL(endpoint); } catch { throw Error("UNTRUSTED_OTA_S3_ENDPOINT"); }
    if (endpointUrl.protocol !== "http:" || !["127.0.0.1","localhost"].includes(endpointUrl.hostname) ||
        endpointUrl.username || endpointUrl.password || endpointUrl.search || endpointUrl.hash)
      throw Error("UNTRUSTED_OTA_S3_ENDPOINT");
  } else {
    assertCloudRuOtaPublisherConfig({ endpoint, region, bucket: process.env.OTA_S3_BUCKET });
  }
  const required = ["OTA_S3_BUCKET", "OTA_S3_ACCESS_KEY", "OTA_S3_SECRET_KEY"];
  if (required.some((env) => !process.env[env])) throw Error("MISSING_OTA_S3_CREDENTIALS");
  const client = new S3Client({
    endpoint, region, forcePathStyle: true,
    credentials: { accessKeyId: process.env.OTA_S3_ACCESS_KEY,
      secretAccessKey: process.env.OTA_S3_SECRET_KEY }, maxAttempts: 2,
  });
  try {
    const report = await uploadImmutableOtaAssets({ client, bucket:process.env.OTA_S3_BUCKET, targets });
    const destination = path.join(directory,"delivery-evidence.json");
    fs.writeFileSync(destination, JSON.stringify({
      state:"UPLOAD_VERIFIED_NOT_PUBLISHED", environment, prefix,
      updateId:metadata.updateId, verifiedAt:new Date().toISOString(), report,
    }, null,2), {flag:"wx",mode:0o600});
    console.log(JSON.stringify({state:"UPLOAD_VERIFIED_NOT_PUBLISHED",count:report.length, evidence:destination}));
  } finally { client.destroy(); }
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname)) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
