import { createHash, createCipheriv, createDecipheriv, randomBytes, X509Certificate, verify } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import { readFile, writeFile, stat, open, mkdtemp, rm, chmod } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { pipeline } from "node:stream/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

export const scopes = ["chat2", "documents", "feed", "gallery", "ota", "questions", "questions-v2", "public"];
const HEX = /^[a-f0-9]{64}$/;
const ID = /^[a-f0-9]{32}$/;
const BUCKET = /^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/;
const PROFILE = /^[a-zA-Z0-9_-]{1,80}$/;
const LIMIT = 4 * 1024 ** 3;
const HEADER = Buffer.from("GAFUS-BACKUP-1\0");
const enc = s => Buffer.from(JSON.stringify(s));
export function must(condition, code) { if (!condition) throw new Error(code); }
export async function digest(path) {
  const h = createHash("sha256");
  for await (const chunk of createReadStream(path)) h.update(chunk);
  return h.digest("hex");
}
export function validObjectKey(key) {
  return typeof key === "string" && Buffer.byteLength(key) > 0 && Buffer.byteLength(key) <= 1024 &&
    !/[\x00-\x1f\x7f]/.test(key);
}
function checkEndpoint(c, local) {
  must(c && typeof c.endpoint === "string" && BUCKET.test(c.bucket) && PROFILE.test(c.profile) &&
    /^[a-z0-9-]{1,40}$/.test(c.region), "BAD_STORAGE_CONFIG");
  const u = new URL(c.endpoint);
  must(!u.username && !u.password && !u.search && !u.hash && u.pathname === "/" &&
    (u.protocol === "https:" || (local && u.protocol === "http:" && u.hostname === "127.0.0.1")),
    "BAD_STORAGE_ENDPOINT");
  return u.origin;
}
export function validateConfig(c, local = false) {
  must(c?.sources && c?.archive && c?.targets, "CONFIG_REQUIRED");
  const keys = Object.keys(c.sources).sort();
  must(scopes.every(s => keys.includes(s)) && keys.every(s => /^[a-z][a-z0-9-]{0,40}$/.test(s)), "SCOPE_INVENTORY_INCOMPLETE");
  must(JSON.stringify(keys) === JSON.stringify(Object.keys(c.targets).sort()), "TARGET_SCOPE_MISMATCH");
  const archiveOrigin = checkEndpoint(c.archive,local);
  const destinations = new Set();
  for (const s of keys) {
    const source = c.sources[s], target = c.targets[s];
    const so = checkEndpoint(source,local), to = checkEndpoint(target,local);
    // Full bucket inventory. Explicitly configure separate legacy buckets as
    // additional scopes; never silently omit prefixes.
    must(!source.prefix && !target.prefix, "PARTIAL_BUCKET_NOT_SUPPORTED");
    must(source.profile !== c.archive.profile && !Object.values(c.sources).some(v=>v.profile===target.profile) &&
      target.profile !== c.archive.profile, "SEPARATE_CREDENTIALS_REQUIRED");
    must((local || so !== archiveOrigin) && source.bucket !== c.archive.bucket, "ARCHIVE_NOT_INDEPENDENT");
    must(/^gafus-restore-[a-z0-9-]{8,45}$/.test(target.bucket), "TARGET_NOT_ISOLATED");
    must(!Object.values(c.sources).some(v=>v.bucket===target.bucket) && target.bucket!==c.archive.bucket, "TARGET_OVERLAPS_SOURCE");
    const key = to + "/" + target.bucket;
    must(!destinations.has(key), "DUPLICATE_TARGET"); destinations.add(key);
  }
  must(c.trustedOtaCertificates && typeof c.trustedOtaCertificates === "object" &&
    Object.entries(c.trustedOtaCertificates).every(([k,v])=>PROFILE.test(k) && Array.isArray(v) &&
      v.length>0 && v.every(x=>HEX.test(x))),"OTA_CERTIFICATE_PINS_REQUIRED");
  const u = new URL(c.otaOrigin);
  must(u.protocol==="https:" && !u.search && !u.hash && !u.username && !u.password &&
    u.pathname.endsWith("/"+c.sources.ota.bucket), "BAD_OTA_ORIGIN");
  return c;
}
// AWS CLI is used only with explicit read-only source and separate archive/
// staging profiles. Stderr may contain secrets or raw object paths: discard it.
export function s3(c, op, args = []) {
  const env = {...process.env, AWS_PAGER:"", AWS_CLI_AUTO_PROMPT:"off",
    AWS_EC2_METADATA_DISABLED:"true", AWS_REQUEST_CHECKSUM_CALCULATION:"when_required",
    AWS_RESPONSE_CHECKSUM_VALIDATION:"when_required"};
  for (const k of ["AWS_ACCESS_KEY_ID","AWS_SECRET_ACCESS_KEY","AWS_SESSION_TOKEN","AWS_PROFILE",
    "AWS_DEFAULT_PROFILE","AWS_ENDPOINT_URL","AWS_ENDPOINT_URL_S3","AWS_ROLE_ARN","AWS_WEB_IDENTITY_TOKEN_FILE"]) delete env[k];
  const r = spawnSync(process.env.GAFUS_AWS_BIN || "aws", ["--no-cli-pager","--no-cli-auto-prompt",
    "--profile",c.profile,"--region",c.region,"--endpoint-url",c.endpoint,
    "--cli-connect-timeout","10","--cli-read-timeout","120","--output","json","s3api",op,...args],
    {env,encoding:"utf8",timeout:600_000,maxBuffer:16*1024*1024});
  must(r.status===0 && !r.error, "S3_"+op.toUpperCase().replaceAll("-","_")+"_FAILED");
  return r.stdout.trim() ? JSON.parse(r.stdout) : {};
}
export function list(c, prefix = "") {
  const records = [], seen = new Set(), tokens = new Set();
  let token;
  do {
    const p = s3(c,"list-objects-v2",["--bucket",c.bucket,"--prefix",prefix,"--max-keys","1000","--no-paginate",
      ...(token?["--continuation-token",token]:[])]);
    for (const item of p.Contents || []) {
      must(validObjectKey(item.Key) && item.Key.startsWith(prefix) && !seen.has(item.Key) &&
        Number.isSafeInteger(item.Size) && item.Size>=0 && item.Size<=LIMIT &&
        /^"[^"\x00-\x1f]{1,128}"$/.test(item.ETag), "BAD_SOURCE_OBJECT");
      seen.add(item.Key);
      records.push({key:item.Key,size:item.Size,etag:item.ETag,modified:item.LastModified});
    }
    const next = p.IsTruncated ? p.NextContinuationToken : undefined;
    must(!p.IsTruncated || (typeof next==="string" && next && next!==token), "BAD_LIST_PAGINATION");
    if(next) {must(!tokens.has(next),"BAD_LIST_PAGINATION");tokens.add(next);}
    token = next;
  } while(token);
  return records.sort((a,b)=>a.key<b.key?-1:a.key>b.key?1:0);
}
export async function seal(src,dst,key,aad) {
  const iv = randomBytes(12);
  const cipher=createCipheriv("aes-256-gcm",key,iv); cipher.setAAD(Buffer.from(aad));
  await writeFile(dst,Buffer.concat([HEADER,iv]),{flag:"wx",mode:0o600});
  await pipeline(createReadStream(src),cipher,createWriteStream(dst,{flags:"a"}));
  const f=await open(dst,"a");try{await f.write(cipher.getAuthTag());}finally{await f.close();}
}
export async function unseal(src,dst,key,aad) {
  const size=(await stat(src)).size;
  must(size>=HEADER.length+12+16 && size<=LIMIT+HEADER.length+28,"BAD_ENVELOPE");
  const f=await open(src,"r");let head=Buffer.alloc(HEADER.length+12),tag=Buffer.alloc(16);
  try { await f.read(head,0,head.length,0);await f.read(tag,0,16,size-16); } finally {await f.close();}
  must(head.subarray(0,HEADER.length).equals(HEADER),"BAD_ENVELOPE");
  const decipher=createDecipheriv("aes-256-gcm",key,head.subarray(HEADER.length));decipher.setAAD(Buffer.from(aad));decipher.setAuthTag(tag);
  try {
    if(size===head.length+16) await writeFile(dst,decipher.final(),{flag:"wx",mode:0o600});
    else await pipeline(createReadStream(src,{start:head.length,end:size-17}),decipher,createWriteStream(dst,{flags:"wx",mode:0o600}));
  } catch { await rm(dst,{force:true});throw Error("BACKUP_AUTHENTICATION_FAILED"); }
}
export function metadata(h) {
  const result={};
  for(const k of ["ContentType","CacheControl","ContentDisposition","ContentEncoding","ContentLanguage","Expires","Metadata"]) {
    if(h[k]!==undefined) result[k]=k==="Metadata" ? Object.fromEntries(Object.entries(h[k]).sort(([a],[b])=>a.localeCompare(b))) : h[k];
  }
  // ACLs, tags, source encryption keys, signed URLs and website redirects
  // are not restored. Target bucket remains private; policy is separate.
  return result;
}
export function verifyOta(releases, origin, byKey, trusted, now = Date.now()) {
  let previous=0,active=0,expired=0;
  for(const r of releases) {
    must(r.nativeVerified===true && r.nativePlatform===r.platform &&
      r.nativeEnvironment===r.environment && r.nativeChannel===r.channel &&
      r.nativeRuntimeVersion===r.runtimeVersion && r.nativeSigningKeyId===r.signingKeyId &&
      HEX.test(r.nativeFingerprint) && HEX.test(r.certificateSha256) &&
      trusted[r.signingKeyId]?.includes(r.certificateSha256) &&
      createHash("sha256").update(r.certificatePem).digest("hex")===r.certificateSha256,
      "OTA_NATIVE_TRUST_MISMATCH");
    must(typeof r.manifestHex==="string" && /^(?:[a-f0-9]{2})+$/.test(r.manifestHex) && r.manifestHex.length<=2_000_000,"OTA_MANIFEST_INVALID");
    const cert=new X509Certificate(r.certificatePem), body=Buffer.from(r.manifestHex,"hex");
    const sig=/^sig="([A-Za-z0-9+/=]+)",\s*keyid="([A-Za-z0-9_-]+)",\s*alg="rsa-v1_5-sha256"$/.exec(r.signatureHeader);
    must(sig && sig[2]===r.signingKeyId && cert.keyUsage?.includes("1.3.6.1.5.5.7.3.3") &&
      verify("RSA-SHA256",body,cert.publicKey,Buffer.from(sig[1],"base64")), "OTA_SIGNATURE_INVALID");
    const m=JSON.parse(body.toString("utf8"));
    must(m.id===r.updateId && m.runtimeVersion===r.runtimeVersion &&
      m.metadata?.channel===r.channel && m.metadata?.environment===r.environment &&
      m.metadata?.sourceSha===r.sourceSha && m.extra?.ota?.revision===r.revision && Array.isArray(m.assets),
      "OTA_SIGNED_TARGET_MISMATCH");
    const publication=m.extra?.ota?.publication;
    if(publication!==undefined)must(publication?.nativeReleaseId===r.nativeReleaseId &&
      publication?.nativeFingerprint===r.nativeFingerprint &&
      m.extra?.expoClient?.extra?.otaNativeReleaseId===r.nativeReleaseId &&
      m.extra?.expoClient?.extra?.otaNativeFingerprint===r.nativeFingerprint,
      "OTA_SIGNED_NATIVE_BINDING_MISMATCH");
    const signedAt=Date.parse(m.createdAt);
    must(Number.isFinite(signedAt) && signedAt>=Date.parse(cert.validFrom) && signedAt<Date.parse(cert.validTo),"OTA_SIGNED_OUTSIDE_CERT_VALIDITY");
    if(now>=Date.parse(cert.validTo)) {
      expired++;
      must(!r.active && !r.previous,"OTA_ACTIVE_OR_PREVIOUS_CERT_EXPIRED");
    }
    const items=new Map(r.artifacts.map(a=>[a.url,a]));
    const assets=[m.launchAsset,...m.assets];
    must(items.size===r.artifacts.length && items.size===assets.length && assets.length>0,"OTA_ARTIFACT_COUNT_MISMATCH");
    const base=origin.replace(/\/$/,"")+"/";
    const prefix="ota/"+r.environment+"/gafus/"+r.runtimeVersion+"/"+r.platform+"/assets/";
    const used=new Set();
    for(const a of assets) {
      const item=items.get(a?.url);
      must(item?.verified===true && HEX.test(item.sha256) && !used.has(item.url) &&
        a.hash===Buffer.from(item.sha256,"hex").toString("base64url") && a.contentType===item.mimeType,
        "OTA_SIGNED_ASSET_MISMATCH");
      used.add(item.url);
      const url=new URL(item.url);
      must(!url.search && !url.hash && !url.username && !url.password && item.url.startsWith(base+prefix),"OTA_ASSET_ORIGIN_MISMATCH");
      const key=decodeURIComponent(item.url.slice(base.length));
      must(validObjectKey(key) && key.endsWith("/"+item.assetKey) && key.startsWith(prefix),"OTA_ASSET_KEY_MISMATCH");
      const entry=byKey.get("ota\0"+key);
      must(entry && entry.sha256===item.sha256 && String(entry.size)===item.sizeBytes,"OTA_BACKUP_BYTES_MISMATCH");
    }
    previous+=Number(r.previous===true);active+=Number(r.active===true);
  }
  return {releases:releases.length,previous,active,expiredHistorical:expired};
}

export function assertPrivateBucket(c, local = false) {
  const acl=s3(c,"get-bucket-acl",["--bucket",c.bucket]);
  must(acl.Owner?.ID && Array.isArray(acl.Grants) && acl.Grants.length>0 &&
    acl.Grants.every(g=>g.Grantee?.Type==="CanonicalUser" && g.Grantee.ID===acl.Owner.ID),
    "BUCKET_ACL_NOT_PRIVATE");
  const status=s3(c,"get-bucket-policy-status",["--bucket",c.bucket]);
  must(status.PolicyStatus?.IsPublic===false,"BUCKET_POLICY_NOT_PRIVATE");
  if(!local) {
    const block=s3(c,"get-public-access-block",["--bucket",c.bucket]).PublicAccessBlockConfiguration;
    must(block?.BlockPublicAcls===true && block.IgnorePublicAcls===true &&
      block.BlockPublicPolicy===true && block.RestrictPublicBuckets===true,"PUBLIC_ACCESS_BLOCK_REQUIRED");
  }
}
