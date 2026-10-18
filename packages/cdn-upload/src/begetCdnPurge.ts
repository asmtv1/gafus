import { createHash } from "node:crypto";

/** Beget Cloud API, not a CDNvideo account. Requires a tested Beget service ID. */
const scopeIds = {
  gallery: "0a8e97d5-3a65-4e90-99a6-c7f61131a461",
  feed: "becd9e5d-4fa8-47da-878c-9b80ded74e71",
  questions: "3c2a1623-50a1-46a1-b7a4-bb1093eaedf0",
} as const;
const hosts = {
  gallery: "mepsuduyokabib.begetcdn.cloud",
  feed: "garaquachegasourn.begetcdn.cloud",
  questions: "ebiteskukingusk.begetcdn.cloud",
} as const;
type Scope = keyof typeof scopeIds;
const id = "[A-Za-z0-9_-]{1,128}";
const galleryPhoto = new RegExp(`^albums/${id}/${id}/photos/${id}/(?:thumb|full)\\.webp$`);
const galleryVetThumb = new RegExp(`^users/${id}/pets/${id}/vet-visits/${id}/${id}/thumb\\.webp$`);
const questionMedia = new RegExp(`^questions/uploads/questions/${id}/${id}(?:\\.(?:jpg|jpeg|png|webp)|/(?:thumb|full)\\.webp)$`);
const feedMedia = new RegExp(`^posts/${id}/${id}/attachments/${id}/(?:thumb\\.webp|full\\.webp|poster\\.webp|hls/(?:playlist\\.m3u8|segment-[0-9]{3,5}\\.ts))$`);
export function isBegetCacheableObjectKey(scope: Scope, key: string): boolean {
  return scope === "gallery" ? galleryPhoto.test(key) || galleryVetThumb.test(key) :
    scope === "questions" ? questionMedia.test(key) : feedMedia.test(key);
}
// The durable operation includes exact keys, so a background retry can verify
// that a freshly authorized CDN request no longer serves cached deleted bytes.
const stamp = /^beget:([a-f0-9]{64}):(\d{13}):(gallery|feed|questions):([A-Za-z0-9_-]+)$/;
const hashBatch = (service: string, paths: string[]) =>
  createHash("sha256").update(JSON.stringify({ service, paths })).digest("hex");
function expectedService(scope: Scope, env: Record<string, string | undefined>): string {
  if (scope === "gallery" && env.GALLERY_CDN_REDIRECT_ENABLED === "true") {
    if (env.GALLERY_CDN_BASE_URL !== "https://dikinuneceswe.begetcdn.cloud" ||
        env.GALLERY_CDN_EDGE_TOKEN_VERIFIED !== "true")
      throw new Error("BEGET_CDN_PURGE_NOT_VERIFIED");
    return "10530e64-21b7-4352-8366-806c79c2f1b7";
  }
  if (scope !== "feed" || env.FEED_BUCKET_PUBLIC !== "true") return scopeIds[scope];
  const service = env.FEED_BEGET_CDN_SERVICE_ID ?? "";
  if (!/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(service) ||
      service === scopeIds.feed)
    throw new Error("BEGET_CDN_PURGE_NOT_VERIFIED");
  return service;
}
function publicFeedHost(value: string): string {
  const match = /^https:\/\/([a-z0-9-]+\.begetcdn\.cloud)$/.exec(value);
  return match && match[1] !== hosts.feed ? match[1] : "";
}
function settings(scope: Scope, env: Record<string, string | undefined> = process.env) {
  const service = env[`${scope.toUpperCase()}_BEGET_CDN_SERVICE_ID`] ?? "";
  if (scope === "gallery" && env.GALLERY_CDN_REDIRECT_ENABLED === "true" &&
      env.GALLERY_CDN_PURGE_DUAL_ENABLED !== "true")
    throw new Error("BEGET_GALLERY_DUAL_PURGE_REQUIRED");
  const expected = expectedService(scope, env);
  if (scope === "questions" &&
      (env.QUESTIONS_CDN_BASE_URL !== "https://ebiteskukingusk.begetcdn.cloud" ||
        env.QUESTIONS_PUBLIC_S3_BUCKET !== "gafus-questions-public" ||
        env.QUESTIONS_CDN_LIVE_VERIFIED !== "true"))
    throw new Error("BEGET_CDN_PURGE_NOT_VERIFIED");
  if (scope === "gallery" && env.GALLERY_CDN_PURGE_DUAL_ENABLED === "true" &&
      (env.GALLERY_CDN_BASE_URL !== (env.GALLERY_CDN_REDIRECT_ENABLED === "true"
        ? "https://dikinuneceswe.begetcdn.cloud" : "https://mepsuduyokabib.begetcdn.cloud") ||
        !/^[A-Za-z0-9_-]{24,128}$/.test(env.GALLERY_CDN_SECRET ?? "") ||
        !/^[A-Za-z0-9]{24,128}$/.test(env.GALLERY_CDN_REDIRECT_SIGNING_SECRET ?? "")))
    throw new Error("BEGET_CDN_PURGE_NOT_VERIFIED");
  const token = env.BEGET_CDN_API_TOKEN ?? "";
  if (env.BEGET_CDN_PURGE_API_VERIFIED !== "true" ||
      env.BEGET_CDN_CACHE_KEY_VERIFIED !== "true" ||
      service !== expected || token.length < 24 ||
      (scope === "feed" && env.FEED_BUCKET_PUBLIC === "true" &&
        !publicFeedHost(env.FEED_CDN_BASE_URL ?? "")))
    throw new Error("BEGET_CDN_PURGE_NOT_VERIFIED");
  return { service, token };
}

export async function beginBegetCdnPurge(
  scope: Scope,
  paths: string[],
  existing: string[],
  checkpoint?: (operations: string[]) => Promise<void>,
): Promise<string[]> {
  const { service, token } = settings(scope);
  if (!paths.length || paths.some(path => !path.startsWith("/") || !isBegetCacheableObjectKey(scope, path.slice(1))))
    throw new Error("BEGET_CDN_UNSAFE_PATH");
  const operations = [...existing];
  // During cutover, old signed links may still be valid. Erase both CDNs.
  const services = scope === "gallery" && process.env.GALLERY_CDN_PURGE_DUAL_ENABLED === "true"
    ? [scopeIds.gallery, "10530e64-21b7-4352-8366-806c79c2f1b7"] : [service];
  for (const target of services) {
  for (let i = 0; i < paths.length; i += 10) {
    const batch = paths.slice(i, i + 10);
    const hash = hashBatch(target, batch);
    if (operations.some(op => op.replace(/^done:/, "").startsWith(`beget:${hash}:`))) continue;
    // The published Beget OpenAPI uses Bearer auth and {service_id, path[]}.
    const response = await fetch(`https://api.beget.com/v1/cloud/cdn/${target}/purge-cache-by-paths`, {
      method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ service_id: target, path: batch }), signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) throw new Error(`BEGET_CDN_PURGE_HTTP_${response.status}`);
    const result: unknown = await response.json();
    if (!result || typeof result !== "object" || !("cdn" in result) ||
        !result.cdn || ("error" in result && result.error))
      throw new Error("BEGET_CDN_PURGE_RESPONSE_UNVERIFIED");
    // API acceptance is NOT a proof of edge propagation. Save the exact keys
    // for read-only post-delete verification on every subsequent worker run.
    const pathsEncoded = Buffer.from(JSON.stringify(batch)).toString("base64url");
    operations.push(`beget:${hash}:${Date.now()}:${scope}:${pathsEncoded}`);
    await checkpoint?.(operations);
  }
  }
  return operations;
}

function readOperation(operation: string, env: Record<string, string | undefined>) {
  const match = stamp.exec(operation);
  if (!match) throw new Error("BEGET_CDN_UNSAFE_OPERATION");
  const scope = match[3] as Scope;
  let paths: unknown;
  try { paths = JSON.parse(Buffer.from(match[4]!, "base64url").toString("utf8")); }
  catch { throw new Error("BEGET_CDN_UNSAFE_OPERATION"); }
  if (!Array.isArray(paths) || !paths.length || paths.length > 10 ||
      paths.some(p => typeof p !== "string" || !p.startsWith("/") ||
        !isBegetCacheableObjectKey(scope, p.slice(1))) ||
      !(scope === "gallery" && env.GALLERY_CDN_PURGE_DUAL_ENABLED === "true"
        ? [scopeIds.gallery, "10530e64-21b7-4352-8366-806c79c2f1b7"]
          .some(service => hashBatch(service, paths) === match[1])
        : hashBatch(expectedService(scope, env), paths) === match[1]))
    throw new Error("BEGET_CDN_UNSAFE_OPERATION");
  const created = Number(match[2]);
  if (!Number.isSafeInteger(created)) throw new Error("BEGET_CDN_UNSAFE_OPERATION");
  const service = scope === "gallery" && env.GALLERY_CDN_PURGE_DUAL_ENABLED === "true" &&
    hashBatch("10530e64-21b7-4352-8366-806c79c2f1b7", paths) === match[1]
    ? "10530e64-21b7-4352-8366-806c79c2f1b7" :
    scope === "gallery" ? scopeIds.gallery : expectedService(scope, env);
  return { scope, created, paths: paths as string[], service };
}

/** Read-only edge validation after Beget purge; never accepts signature 403/410
 * as deletion proof. Requires the real Gallery/Feed signing secret and a 404
 * from BOTH HEAD and GET for every deleted, once-cached final object.
 */
export async function begetCdnPurgeDone(
  operation: string,
  now = Date.now(),
  env: Record<string, string | undefined> = process.env,
  fetcher: typeof fetch = fetch,
): Promise<boolean> {
  const { scope, created, paths, service } = readOperation(operation, env);
  settings(scope, env);
  if (env.BEGET_CDN_PURGE_PROPAGATION_VERIFIED !== "true")
    throw new Error("BEGET_CDN_PURGE_NOT_VERIFIED");
  // Cleanup may be delayed longer than a year by an external outage. Never
  // permanently strand deleted private media just because the queue is old.
  if (created > now || created < 1_600_000_000_000)
    throw new Error("BEGET_CDN_UNSAFE_OPERATION");
  if (now - created < 300_000) return false;
  const secret = scope === "gallery" && service !== scopeIds.gallery &&
    env.GALLERY_CDN_PURGE_DUAL_ENABLED === "true"
    ? env.GALLERY_CDN_REDIRECT_SIGNING_SECRET ?? ""
    : env[`${scope.toUpperCase()}_CDN_SECRET`] ?? "";
  const base = env[`${scope.toUpperCase()}_CDN_BASE_URL`];
  // Preserve validated legacy signing values. Gallery's CDNvideo signer
  // permits longer keys than the Feed signer; do not silently require rotation.
  const allowedSecret = scope === "gallery"
    ? /^[A-Za-z0-9_-]{24,128}$/
    : /^[A-Za-z0-9_-]{24,32}$/;
  const publicRead = scope === "questions" || (scope === "feed" && env.FEED_BUCKET_PUBLIC === "true");
  const publicHost = publicRead ? publicFeedHost(base ?? "") : "";
  if (scope === "questions" ? base !== `https://${hosts.questions}` :
      publicRead ? !publicHost :
      (scope === "gallery" && env.GALLERY_CDN_PURGE_DUAL_ENABLED === "true"
        ? !["https://mepsuduyokabib.begetcdn.cloud", "https://dikinuneceswe.begetcdn.cloud"].includes(base ?? "") ||
          !allowedSecret.test(secret)
        : base !== `https://${hosts[scope]}` || !allowedSecret.test(secret)))
    throw new Error("BEGET_CDN_EDGE_PROOF_UNAVAILABLE");
  const expires = Math.floor(now / 1000) + 90;
  for (const path of paths) {
    const signature = publicRead ? "" : createHash("md5").update(`${secret}${path}${expires}`).digest("base64url");
    const verifyHost = scope === "gallery" && env.GALLERY_CDN_PURGE_DUAL_ENABLED === "true" &&
      service !== scopeIds.gallery ? "dikinuneceswe.begetcdn.cloud" : hosts[scope];
    const url = scope === "questions" ? `https://${hosts.questions}${path}` :
      publicRead ? `https://${publicHost}${path}`
      : `https://${verifyHost}/md5(${signature},${expires})${path}`;
    for (const method of ["HEAD", "GET"] as const) {
      const response = await fetcher(url, {
        method, redirect: "manual", cache: "no-store", signal: AbortSignal.timeout(7000),
      });
      void response.body?.cancel();
      if (response.status !== 404) return false;
    }
  }
  return true;
}
