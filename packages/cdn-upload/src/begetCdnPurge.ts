import { createHash } from "node:crypto";

/** Beget Cloud API, not a CDNvideo account. Requires a tested Beget service ID. */
const scopeIds = {
  gallery: "0a8e97d5-3a65-4e90-99a6-c7f61131a461",
  feed: "becd9e5d-4fa8-47da-878c-9b80ded74e71",
} as const;
const hosts = {
  gallery: "mepsuduyokabib.begetcdn.cloud",
  feed: "garaquachegasourn.begetcdn.cloud",
} as const;
type Scope = keyof typeof scopeIds;
const id = "[A-Za-z0-9_-]{1,128}";
const galleryPhoto = new RegExp(`^albums/${id}/${id}/photos/${id}/(?:thumb|full)\\.webp$`);
const galleryVetThumb = new RegExp(`^users/${id}/pets/${id}/vet-visits/${id}/${id}/thumb\\.webp$`);
const feedMedia = new RegExp(`^posts/${id}/${id}/attachments/${id}/(?:thumb\\.webp|full\\.webp|poster\\.webp|hls/segment-[0-9]{3,5}\\.ts)$`);
export function isBegetCacheableObjectKey(scope: Scope, key: string): boolean {
  return scope === "gallery" ? galleryPhoto.test(key) || galleryVetThumb.test(key) : feedMedia.test(key);
}
// The durable operation includes exact keys, so a background retry can verify
// that a freshly authorized CDN request no longer serves cached deleted bytes.
const stamp = /^beget:([a-f0-9]{64}):(\d{13}):(gallery|feed):([A-Za-z0-9_-]+)$/;
const hashBatch = (service: string, paths: string[]) =>
  createHash("sha256").update(JSON.stringify({ service, paths })).digest("hex");
function settings(scope: Scope, env: Record<string, string | undefined> = process.env) {
  const service = env[`${scope.toUpperCase()}_BEGET_CDN_SERVICE_ID`] ?? "";
  const token = env.BEGET_CDN_API_TOKEN ?? "";
  if (env.BEGET_CDN_PURGE_API_VERIFIED !== "true" ||
      env.BEGET_CDN_CACHE_KEY_VERIFIED !== "true" ||
      service !== scopeIds[scope] || token.length < 24)
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
  for (let i = 0; i < paths.length; i += 10) {
    const batch = paths.slice(i, i + 10);
    const hash = hashBatch(service, batch);
    if (operations.some(op => op.replace(/^done:/, "").startsWith(`beget:${hash}:`))) continue;
    // The published Beget OpenAPI uses Bearer auth and {service_id, path[]}.
    const response = await fetch(`https://api.beget.com/v1/cloud/cdn/${service}/purge-cache-by-paths`, {
      method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ service_id: service, path: batch }), signal: AbortSignal.timeout(10_000),
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
  return operations;
}

function readOperation(operation: string) {
  const match = stamp.exec(operation);
  if (!match) throw new Error("BEGET_CDN_UNSAFE_OPERATION");
  const scope = match[3] as Scope;
  let paths: unknown;
  try { paths = JSON.parse(Buffer.from(match[4]!, "base64url").toString("utf8")); }
  catch { throw new Error("BEGET_CDN_UNSAFE_OPERATION"); }
  if (!Array.isArray(paths) || !paths.length || paths.length > 10 ||
      paths.some(p => typeof p !== "string" || !p.startsWith("/") ||
        !isBegetCacheableObjectKey(scope, p.slice(1))) ||
      hashBatch(scopeIds[scope], paths) !== match[1])
    throw new Error("BEGET_CDN_UNSAFE_OPERATION");
  const created = Number(match[2]);
  if (!Number.isSafeInteger(created)) throw new Error("BEGET_CDN_UNSAFE_OPERATION");
  return { scope, created, paths: paths as string[] };
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
  const { scope, created, paths } = readOperation(operation);
  settings(scope, env);
  if (env.BEGET_CDN_PURGE_PROPAGATION_VERIFIED !== "true")
    throw new Error("BEGET_CDN_PURGE_NOT_VERIFIED");
  // Cleanup may be delayed longer than a year by an external outage. Never
  // permanently strand deleted private media just because the queue is old.
  if (created > now || created < 1_600_000_000_000)
    throw new Error("BEGET_CDN_UNSAFE_OPERATION");
  if (now - created < 300_000) return false;
  const secret = env[`${scope.toUpperCase()}_CDN_SECRET`] ?? "";
  const base = env[`${scope.toUpperCase()}_CDN_BASE_URL`];
  // Preserve validated legacy signing values. Gallery's CDNvideo signer
  // permits longer keys than the Feed signer; do not silently require rotation.
  const allowedSecret = scope === "gallery"
    ? /^[A-Za-z0-9_-]{24,128}$/
    : /^[A-Za-z0-9_-]{24,32}$/;
  if (base !== `https://${hosts[scope]}` || !allowedSecret.test(secret))
    throw new Error("BEGET_CDN_EDGE_PROOF_UNAVAILABLE");
  const expires = Math.floor(now / 1000) + 90;
  for (const path of paths) {
    const signature = createHash("md5").update(`${secret}${path}${expires}`).digest("base64url");
    const url = `https://${hosts[scope]}/md5(${signature},${expires})${path}`;
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
