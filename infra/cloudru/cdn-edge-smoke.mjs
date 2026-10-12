/** Read-only fail-closed CDN verification. Do NOT enable Cloud.ru CDN on code review alone. */
import { pathToFileURL } from "node:url";

function validateUrls(input) {
  const { origin, valid, expired, tampered } = input;
  if (!origin || !valid || !expired || !tampered) throw new Error("CDN_EDGE_SMOKE_URLS_MISSING");
  const expected = new URL(origin);
  const urls = [valid, expired, tampered].map((url) => new URL(url));
  if (
    expected.protocol !== "https:" ||
    expected.pathname !== "/" ||
    expected.search ||
    expected.hash ||
    expected.username ||
    expected.password ||
    expected.port
  )
    throw new Error("CDN_EDGE_SMOKE_UNSAFE_ORIGIN");
  for (const url of urls) {
    if (
      url.protocol !== "https:" ||
      url.origin !== expected.origin ||
      !url.search ||
      url.username ||
      url.password ||
      url.port ||
      url.hash ||
      url.pathname.includes("%")
    )
      throw new Error("CDN_EDGE_SMOKE_UNTRUSTED_URL");
    if (url.pathname !== urls[0].pathname) throw new Error("CDN_EDGE_SMOKE_MISMATCHED_KEY");
  }
  if (new Set(urls.map((url) => url.search)).size !== urls.length)
    throw new Error("CDN_EDGE_SMOKE_DUPLICATE_TOKEN");
  return urls;
}
const cacheHit = (response) =>
  ["x-cache", "x-cache-status", "x-cdn-cache", "x-cached"].some((name) =>
    /(^|[;,\s])HIT([;,\s]|$)/i.test(response.headers.get(name) ?? ""),
  );
export async function verifyCdnEdge(input, fetcher = fetch) {
  const [valid, expired, tampered] = validateUrls(input);
  const request = async (url, method = "GET", headers = {}) => {
    const response = await fetcher(url.toString(), {
      method,
      headers,
      redirect: "manual",
      signal: AbortSignal.timeout(15000),
    });
    // No redirects: a redirect could bypass the edge's token validation.
    return response;
  };
  const first = await request(valid);
  if (first.status !== 200) throw new Error("CDN_EDGE_SMOKE_VALID_MISS_FAILED");
  const coldBody = Buffer.from(await first.arrayBuffer());
  if (!coldBody.byteLength || coldBody.byteLength > 5 * 1024 * 1024)
    throw new Error("CDN_EDGE_SMOKE_UNEXPECTED_BODY");
  const second = await request(valid);
  if (second.status !== 200 || !cacheHit(second))
    throw new Error("CDN_EDGE_SMOKE_CACHE_HIT_UNVERIFIED");
  if (!Buffer.from(await second.arrayBuffer()).equals(coldBody))
    throw new Error("CDN_EDGE_SMOKE_CACHE_CONTENT_CHANGED");
  const deniedExpired = await request(expired);
  if (![401, 403].includes(deniedExpired.status))
    throw new Error("CDN_EDGE_SMOKE_EXPIRED_TOKEN_ALLOWED");
  await deniedExpired.body?.cancel();
  const deniedTampered = await request(tampered);
  if (![401, 403].includes(deniedTampered.status))
    throw new Error("CDN_EDGE_SMOKE_TAMPERED_TOKEN_ALLOWED");
  await deniedTampered.body?.cancel();
  const head = await request(valid, "HEAD");
  if (head.status !== 200) throw new Error("CDN_EDGE_SMOKE_HEAD_FAILED");
  await head.body?.cancel();
  const partial = await request(valid, "GET", { range: "bytes=0-3" });
  if (
    partial.status !== 206 ||
    !/^bytes 0-3\/\d+$/.test(partial.headers.get("content-range") ?? "")
  )
    throw new Error("CDN_EDGE_SMOKE_RANGE_FAILED");
  if (!Buffer.from(await partial.arrayBuffer()).equals(coldBody.subarray(0, 4)))
    throw new Error("CDN_EDGE_SMOKE_RANGE_CONTENT_CHANGED");
  return {
    valid: true,
    cacheHit: true,
    expiredDenied: true,
    tamperedDenied: true,
    head: true,
    range: true,
    bytesChecked: coldBody.byteLength,
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const scopes = ["GALLERY", "FEED"];
  for (const scope of scopes) {
    const origin = process.env[`${scope}_CDN_BASE_URL`];
    const valid = process.env[`${scope}_CDN_SMOKE_VALID_URL`];
    const expired = process.env[`${scope}_CDN_SMOKE_EXPIRED_URL`];
    const tampered = process.env[`${scope}_CDN_SMOKE_TAMPERED_URL`];
    try {
      const result = await verifyCdnEdge({ origin, valid, expired, tampered });
      console.log(JSON.stringify({ scope, ...result }));
    } catch (error) {
      // Never log a signed URL, response headers, credentials or opaque body.
      console.error(
        `${scope}: ${error instanceof Error && /^CDN_EDGE_SMOKE_[A-Z_]+$/.test(error.message) ? error.message : "CDN_EDGE_SMOKE_FAILED"}`,
      );
      process.exitCode = 1;
    }
  }
}
