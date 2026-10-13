import assert from "node:assert/strict";
import { isDegradableCdnFailure, transientEdge5xx } from "./cdn-edge-degradation.mjs";
import { verifyStableCdnGet } from "./cdn-stability.mjs";

const e = transientEdge5xx("feed", "propagation", 504);
assert.equal(isDegradableCdnFailure(e, "feed", true), true);
assert.equal(isDegradableCdnFailure(e, "gallery", true), false);
assert.equal(isDegradableCdnFailure(e, "feed", false), false);
assert.equal(isDegradableCdnFailure({ ...e }, "feed", true), false);
assert.equal(isDegradableCdnFailure(Error("CDN_EDGE_HTTP_403_feed"), "feed", true), false);
assert.equal(isDegradableCdnFailure(Error("CDN_EDGE_BYTES_MISMATCH_feed"), "feed", true), false);
assert.equal(isDegradableCdnFailure(Error("CDN_SIGNATURE_TLS_OR_SECRET_MISMATCH_feed"), "feed", true), false);
assert.equal(isDegradableCdnFailure(Error("CDN_DIRECT_ORIGIN_UNSTABLE_feed_after_3"), "feed", true), false);
assert.equal(isDegradableCdnFailure(Error("CDN_SIGNED_S3_FALLBACK_FAILED_feed"), "feed", true), false);
assert.throws(() => transientEdge5xx("feed", "propagation", 403), /INVALID_TRANSIENT/);
assert.throws(() => transientEdge5xx("feed", "propagation", 200), /INVALID_TRANSIENT/);

const expectedBytes = Buffer.from("known webp fixture");
async function failedProbe(events) {
  let i = 0;
  try {
    await verifyStableCdnGet({
      kind: "gallery", expectedBytes, samples: 2, maxAttempts: events.length,
      urlForAttempt: () => "https://gallery.example.test/signed",
      fetcher: async () => {
        const event = events[i++];
        if (event instanceof Error) throw event;
        return new Response(event === 200 ? expectedBytes : null, { status: event });
      },
      wait: async () => {}, retryDelayMs: 0,
    });
  } catch (error) { return error; }
  throw Error("EXPECTED_STABILITY_FAILURE");
}
const outage = await failedProbe([504, 503, 504]);
assert.equal(isDegradableCdnFailure(outage, "gallery", true), true);
const tls = await failedProbe([504, new TypeError("certificate verify failed"), 504]);
assert.equal(isDegradableCdnFailure(tls, "gallery", true), false);
const denied = await failedProbe([403, 504]);
assert.equal(isDegradableCdnFailure(denied, "gallery", true), false);
const unexpected = await failedProbe([200, 302]);
assert.equal(isDegradableCdnFailure(unexpected, "gallery", true), false);

console.log("Cloud.ru CDN 5xx-only degradation and strict non-5xx release guards PASS");
