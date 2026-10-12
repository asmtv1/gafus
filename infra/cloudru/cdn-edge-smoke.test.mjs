import assert from "node:assert/strict";
import { verifyCdnEdge } from "./cdn-edge-smoke.mjs";
const origin = "https://media.example.com/";
const path = "albums/u/a/photos/p/full.webp";
const urls = {
  origin,
  valid: `${origin}${path}?token=valid`,
  expired: `${origin}${path}?token=expired`,
  tampered: `${origin}${path}?token=tampered`,
};
const data = Buffer.from([1, 2, 3, 4, 5, 6]);
const response = (status, body, headers) => new Response(body, { status, headers });
function fixture(expiredStatus = 403, warmCache = "HIT") {
  let index = 0;
  return async () => {
    const value = [
      response(200, data),
      response(200, data, { "x-cache": warmCache }),
      response(expiredStatus),
      response(403),
      response(200),
      response(206, data.subarray(0, 4), { "content-range": "bytes 0-3/6" }),
    ][index++];
    assert(value);
    return value;
  };
}
assert.deepEqual(await verifyCdnEdge(urls, fixture()), {
  valid: true,
  cacheHit: true,
  expiredDenied: true,
  tamperedDenied: true,
  head: true,
  range: true,
  bytesChecked: 6,
});
await assert.rejects(verifyCdnEdge(urls, fixture(200)), /CDN_EDGE_SMOKE_EXPIRED_TOKEN_ALLOWED/);
await assert.rejects(
  verifyCdnEdge(urls, fixture(403, "MISS")),
  /CDN_EDGE_SMOKE_CACHE_HIT_UNVERIFIED/,
);
await assert.rejects(
  verifyCdnEdge({ ...urls, expired: "https://attacker.test/path?token=a" }, fixture()),
  /CDN_EDGE_SMOKE_UNTRUSTED_URL/,
);
console.log("Cloud.ru CDN cache-hit, expired, tampered, HEAD and Range acceptance tests PASS");
